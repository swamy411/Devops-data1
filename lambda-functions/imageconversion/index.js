process.env.PATH = process.env.PATH + ":/var/task";
process.env["FFMPEG_PATH"] = process.env["LAMBDA_TASK_ROOT"] + "/ffmpeg";
var child_process = require("child_process"),
  async = require("async"),
    AWS = require("aws-sdk"),
    fs = require("fs"),
    utils = {
      decodeKey: function (key) {
        return decodeURIComponent(key).replace(/\+/g, " ");
      }
    };
var s3 = new AWS.S3();
var allowedFileTypes = ["jpg", "png", "tiff", "jpeg", "bmp", "gif"];

var thumbWidth = 180,
  thumbHeight = -1; //For automatic scalling use -1


exports.handler = function (event, context, callback) {
  let bucket = event.Records[0].s3.bucket.name;
  let key = utils.decodeKey(event.Records[0].s3.object.key);
  let params = {
      Bucket: bucket,
      Key: key
  };
  let metaData = undefined;
  console.log('Put event received for bucket: ' + bucket + ', key: ' + key);

  //Get the header info for the upload
  s3.headObject(params, (err, data) => {
    if (err) {
      var error_message = 'Error in getting  metadata for bucket: ' + bucket
        + ', key: ' + key + ', Error: ' + err;
      console.error(error_message);
      callback(error_message);
      return;
    }
    else {
      metaData = data.Metadata;
      console.log('Success in getting metadata for bucket: ', metaData);
      console.log('Complete data ' + JSON.stringify(data));
      convertImage(event, context, callback, metaData);
    }
  });
  // We're going to do the transcoding asynchronously, so we callback immediately.
  callback();
};

function convertImage(event, context, callback, metaData) {
  let tmpFile = fs.createWriteStream("/tmp/screenshot.jpg");
  let srcKey = utils.decodeKey(event.Records[0].s3.object.key);
  let bucket = event.Records[0].s3.bucket.name;
  let srcImage = srcKey.split('/');
  console.log('###src key ', srcImage, srcImage.length);
  let dstKey = '';  
  dstKey = srcKey;
  console.log('###dstKey', dstKey);
  let dstKeyname = dstKey;
  let fileType = srcKey.match(/\.\w+$/);
  let target = s3.getSignedUrl("getObject", {
    Bucket: bucket,
    Key: srcKey,
    Expires: 900
  });
  console.log('###target', target);

  if (fileType === null) {
    context.fail("Invalid filetype found for key: " + srcKey);
    return;
  }
  console.log('##fileType ', fileType);
  fileType = fileType[0].substr(1);
  console.log('##fileType substr ',fileType);
  let uploadFrom = metaData['convertimage'];
  const webOnly = (!!uploadFrom && uploadFrom == 'webtiffconversion')? true : false;
  if (!webOnly) {
    console.log("File not required for image conversion");
    context.fail("File not required for image conversion");
    return;
  }  

  var thumbMatch = srcKey.includes("Thumb");
  if (thumbMatch) {
    context.fail("Could not create thumbnail for thumbnail images.");
    return;
  }
  if (allowedFileTypes.indexOf(fileType) === -1) {
    context.fail("Filetype " + fileType + " not valid for image conversion, exiting");
    return;
  }

  let converted = metaData['converted'];
  console.log('converted ###', converted);
  if (!!converted && converted == 'success') {
    console.log("inside already Image conversion");
    context.fail("Already Image conversion is done.");
    return;
  }
  async.waterfall([

      function createThumbnail(next) {

        let ffmpeg = child_process.spawn("ffmpeg", [
          "-i", target, // url to stream from
          "-f", "image2",         
          "pipe:1"
        ]);
        ffmpeg.on("error", function (err) {
          console.log('ffmpeg error', err);
        })
        ffmpeg.on("close", function (code) {
          if (code != 0) {
            console.log("child process exited with code " + code);
          } else {
            console.log("Processing finished !");
          }
          tmpFile.end();
          next(code);
        });
        tmpFile.on("error", function (err) {
          console.log("stream err: ", err);
        });
        ffmpeg.on("end", function () {
          tmpFile.end();
        })
        ffmpeg.stdout.pipe(tmpFile)
          .on("error", function (err) {
            console.log("error while writing: ", err);
          });
      },

      function uploadThumbnail(next) {
        let tmpFile = fs.createReadStream("/tmp/screenshot.jpg");
        child_process.exec("echo `ls -l -R /tmp`",
          function (error, stdout, stderr) {
            console.log("stdout: " + stdout) // for checking on the screenshot
          });
        metaData['converted'] = 'success';
        let params = {
          Bucket: bucket,
          Key: dstKeyname,
          Body: tmpFile,
          ContentType: "binary/octet-stream",
          //ACL: "public-read",
          Metadata: metaData,
        };
        console.log('##Params ',params);
        let uploadMe = s3.upload(params);
        uploadMe.send(
          function (err, data) {
            if (err != null) console.log("error: " + err);
            next(err);
          }
        );
      }
    ],
    function (err) {
      if (err) {
        console.error(
          "Unable to convert image for '" + bucket + "/" + srcKey + "'" +
          " due to error: " + err
        );
        context.fail(err);
      } else {
        context.succeed("Image Conversion Success for '" + bucket + "/" + srcKey + "'");
      }
    }
  );
}
