process.env.PATH = process.env.PATH + ":/var/task";
process.env["FFMPEG_PATH"] = process.env["LAMBDA_TASK_ROOT"] + "/ffmpeg";
const child_process = require('child_process');
const fs = require('fs');
const path = require('path');

const AWS = require('aws-sdk');
const request = require('request');
const tempy = require('tempy');
var utils = {
  decodeKey: function (key) {
    return decodeURIComponent(key).replace(/\+/g, " ");
  }
};

const s3 = new AWS.S3();
var allowedFileTypes = ["mp4"];

exports.handler = (event, context, callback) => {

  let bucket = event.Records[0].s3.bucket.name;
  let key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
  let params = {
      Bucket: bucket,
      Key: key
  };
  let metaData = undefined, uploadedFrom = undefined, converted = undefined;
  console.log('Put event received for bucket: ' + bucket + ', key: ' + key);

  //Get the header info for the upload
  s3.headObject(params, (err, data) => {
    if (err) {
      var error_message = 'Error in getting  metadata for bucket: ' + bucket
        + ', key: ' + key + ', Error: ' + err;
      console.error(error_message);
      callback(error_message);
    }
    else {
      metaData = data.Metadata;
      console.log('Success in getting metadata for bucket: ', metaData);
      console.log('Complete data ' + JSON.stringify(data));
      convertVideo(event, context, callback, metaData);
    }
  });
  // We're going to do the transcoding asynchronously, so we callback immediately.
  callback();
};

function convertVideo(event, context, callback, metaData) {
  const srcKey = utils.decodeKey(event.Records[0].s3.object.key);
  var destKey = '';
  destKey = srcKey;
  const logKey = `${srcKey}.log`;
  console.log('logkey '+ logKey);
  const s3Bucket = event.Records[0].s3.bucket.name ;
  
  const url = s3.getSignedUrl("getObject", {
    Bucket: s3Bucket,
    Key: srcKey,
    Expires: 900
  });
  var fileType = srcKey.match(/\.\w+$/);
  console.log('s3bucket '+ s3Bucket, 'signed url ', url);
  // Create temporary input/output filenames that we can clean up afterwards.
  

  console.log("File type "+ fileType);
  if (fileType === null) {
    console.log("inside filetype null");
    context.fail("Invalid filetype found for key: " + srcKey);
    return;
  }

  let uploadFrom = metaData['convertvideo'];
  const webOnly = (!!uploadFrom && uploadFrom == 'webvideoconversion')? true : false;
  console.log('###check upload from ', uploadFrom, '  ### ', webOnly);
  console.log('Allowed file type ', allowedFileTypes.indexOf(fileType));
  fileType = fileType[0].substr(1);
  if (!webOnly) {
    console.log("File not required for video conversion");
    context.fail("File not required for video conversion");
    return;
  }  
  if (allowedFileTypes.indexOf(fileType) === -1) {
    console.log("Inside not allowed file type");
    context.fail("Filetype " + fileType + " not valid for Video convertion, exiting");
    return;
  }

  let converted = metaData['converted'];
  console.log('converted ###', converted);
  console.log("Inside already ", (webOnly && !!converted && converted == 'success' && allowedFileTypes.indexOf(fileType) != -1));
  if (!!converted && converted == 'success' && allowedFileTypes.indexOf(fileType) != -1) {
      console.log("inside already Video conversion");
      context.fail("Already Video conversion is done.");
      return;
  }

  const inputFilename = tempy.file();
  let ffmpegArgs;
  let tmpExtension = { extension: 'mp4' };
  let mp4Filename = tempy.file(tmpExtension);//'/tmp/Video.mp4';
  ffmpegArgs = [
    '-i', inputFilename,
    '-vcodec', 'libx264',
    '-acodec', 'aac',
    mp4Filename,
  ];
  

  // Download the source file.
  Promise.resolve().then(() => new Promise((resolve, revoke) => {
    const writeStream = fs.createWriteStream(inputFilename);
    writeStream.on('finish', resolve);
    writeStream.on('error', revoke);
    request(url).pipe(writeStream);
  }))
  // Perform the actual transcoding.
  .then(() => {
    // Use the Exodus ffmpeg bundled executable.
    const ffmpeg = path.resolve(__dirname, 'ffmpeg');      
    console.log('ffmpef args ', ffmpegArgs);
    const process = child_process.spawnSync(ffmpeg, ffmpegArgs);
    console.log('process '+JSON.stringify(process));
    return process.stdout.toString() + process.stderr.toString();
  })
  // Upload the generated Video to S3.
  .then(logContent => new Promise((resolve, revoke) => {
    console.log('inside upadting metadata '+ JSON.stringify(metaData));
    metaData['converted'] = 'success';
    let putObjParam = {
      Body: fs.createReadStream(mp4Filename),
      Bucket: s3Bucket,
      Key: destKey,
      Metadata: metaData,
      ContentType: 'video/mp4'          
    }
    console.log('putobject param ###', putObjParam);
    s3.putObject(putObjParam, (error) => {
      if (error) {
        revoke(error);
        context.fail("Failed in putobject: " + error);
      } else {
        context.succeed("Successfully uploaded the converted Video");
        // Update a log of the FFmpeg output.
        // const logFilename = path.basename(logKey);
        // s3.putObject({
        //   Body: logContent,
        //   Bucket: s3Bucket,
        //   ContentType: 'text/plain',
        //   ContentDisposition: `inline; filename="${logFilename.replace('"', '\'')}"`,
        //   Key: logKey,
        // }, resolve);
      }
    })
  }))
  .catch((rejectReason) => {
    console.log('Video Conversion Rejected ### ', rejectReason);
  })
  // Delete the temporary files.
  .then(() => {
    
    [inputFilename, mp4Filename].forEach((filename) => {
      if (fs.existsSync(filename)) {
        fs.unlinkSync(filename);
      }
    });
  });
}