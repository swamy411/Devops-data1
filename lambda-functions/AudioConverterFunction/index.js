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
var allowedFileTypes = ["mp3", "m4a"];

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
      convertAudio(event, context, callback, metaData);
    }
  });
  // We're going to do the transcoding asynchronously, so we callback immediately.
  callback();
};

function convertAudio(event, context, callback, metaData) {
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
  
  fileType = fileType[0].substr(1);  
  if (allowedFileTypes.indexOf(fileType) === -1) {
    console.log("Inside not allowed file type");
    context.fail("Filetype " + fileType + " not valid for audio convertion, exiting");
    return;
  }

  var manualMatch = srcKey.includes("z_");
  let converted = metaData['converted'];
  console.log('converted ###', converted);
  if (!!converted && converted == 'success' && allowedFileTypes.indexOf(fileType) != -1) {
      console.log("inside already audio conversion");
      context.fail("Already audio conversion is done.");
      return;
  }

  const inputFilename = tempy.file();
  let ffmpegArgs;
  let tmpExtension = { extension: 'mp3' };
  let mp3Filename = tempy.file(tmpExtension);//'/tmp/audio.mp3';
  ffmpegArgs = [
    '-i', inputFilename,
    '-vn', // Disable the video stream in the output.
    '-acodec', 'libmp3lame', // Use Lame for the mp3 encoding.
    '-ac', '2', // Set 2 audio channels.
    '-q:a', '6', // Set the quality to be roughly 128 kb/s.
    mp3Filename,
  ];
  if (fileType === 'm4a' ) {
    tmpExtension = { extension: 'm4a' };
    mp3Filename = tempy.file(tmpExtension);
    ffmpegArgs = [
      '-i', inputFilename,
      '-vn', // Disable the video stream in the output.
      '-acodec', 'aac', // Use Lame for the mp3 encoding.
      '-ac', '2', // Set 2 audio channels.
      '-q:a', '6', // Set the quality to be roughly 128 kb/s.
      mp3Filename,
    ];
  }
  

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
  // Upload the generated audio to S3.
  .then(logContent => new Promise((resolve, revoke) => {
    console.log('inside upadting metadata '+ JSON.stringify(metaData));
    metaData['converted'] = 'success';
    let putObjParam = {
      Body: fs.createReadStream(mp3Filename),
      Bucket: s3Bucket,
      Key: destKey,
      Metadata: metaData,
      ContentType: 'audio/mp3'          
    }
    if (fileType === 'm4a' ) { 
      putObjParam['ContentType'] = 'audio/m4a';
    }
    console.log('putobject param ###', putObjParam);
    s3.putObject(putObjParam, (error) => {
      if (error) {
        revoke(error);
        context.fail("Failed in putobject: " + error);
      } else {
        context.succeed("Successfully uploaded the converted audio");
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
    console.log('Audio Conversion Rejected ### ', rejectReason);
  })
  // Delete the temporary files.
  .then(() => {
    
    [inputFilename, mp3Filename].forEach((filename) => {
      if (fs.existsSync(filename)) {
        fs.unlinkSync(filename);
      }
    });
  });
}
