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


exports.handler = function (event, context) {
  var tmpFile = fs.createWriteStream("/tmp/screenshot.jpg");
  var srcKey = utils.decodeKey(event.Records[0].s3.object.key);
  var bucket = event.Records[0].s3.bucket.name;
  var srcImage = srcKey.split('/');
  console.log('###src key ', srcImage, srcImage.length);
  var dstKey = '';
  for (var i = 0; i < srcImage.length - 1; i++) {
    dstKey += srcImage[i] + '/';
  }
  dstKey += "Thumb_" + srcImage[srcImage.length - 1];
  console.log('###dstKey', dstKey);
  var dstKeyname = dstKey;//dstKey.replace(/\.\w+$/, ".jpg");
  var fileType = srcKey.match(/\.\w+$/);
  var target = s3.getSignedUrl("getObject", {
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
  var thumbMatch = srcKey.includes("Thumb");
  if (thumbMatch) {
    context.fail("Could not create thumbnail for thumbnail images.");
    return;
  }
  if (allowedFileTypes.indexOf(fileType) === -1) {
    context.fail("Filetype " + fileType + " not valid for thumbnail, exiting");
    return;
  }
  async.waterfall([

      function createThumbnail(next) {

        var ffmpeg = child_process.spawn("ffmpeg", [
          "-i", target, // url to stream from
          "-vf", "thumbnail,scale=" + thumbWidth + ":" + thumbHeight,
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
        var tmpFile = fs.createReadStream("/tmp/screenshot.jpg");
        child_process.exec("echo `ls -l -R /tmp`",
          function (error, stdout, stderr) {
            console.log("stdout: " + stdout) // for checking on the screenshot
          });
        var params = {
          Bucket: bucket,
          Key: dstKeyname,
          Body: tmpFile,
          ContentType: "binary/octet-stream",
          //ACL: "public-read",
          Metadata: {
            thumbnail: "TRUE"
          }
        };

        var uploadMe = s3.upload(params);
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
          "Unable to generate thumbnail for '" + bucket + "/" + srcKey + "'" +
          " due to error: " + err
        );
        context.fail(err);
      } else {
        context.succeed("Created thumbnail for '" + bucket + "/" + srcKey + "'");
      }
    }
  );
};
