/** original tutorial is available at
https://concrete5.co.jp/blog/creating-video-thumbnails-aws-lambda-your-s3-bucket
Copyright: Derek Cameron
License: CC 4.0
 **/
process.env.PATH = process.env.PATH + ":/var/task";
process.env["FFMPEG_PATH"] = process.env["LAMBDA_TASK_ROOT"] + "/ffmpeg";
    var child_process = require("child_process"),
        async = require("async"),
        AWS = require("aws-sdk"),
        fs = require("fs"),
        utils = {
            decodeKey: function(key) {
                return decodeURIComponent(key).replace(/\+/g, " ");
                }
        };
// Windows zip files dont save permissions...
//child_process.exec('chmod 777 /var/task/ffmpeg', function (error, stdout, stderr) {
  //          if (error) {
    //            console.log('ffmpeg permissions couldnt be set');
      //      } else {
        //        console.log("stdout: " + stdout) // chmod ffmpeg
          //  }
          //});
var s3 = new AWS.S3();
//  var thumbKeyPrefix = "Thumb_";
  var allowedFileTypes = ["mov", "mpg", "mpeg", "mp4", "wmv","avi"];

var   thumbWidth = 180, 
  thumbHeight = 105; //For automatic scalling use -1


exports.handler = function(event, context) {
  var tmpFile = fs.createWriteStream("/tmp/screenshot.jpg");
  var srcKey = utils.decodeKey(event.Records[0].s3.object.key);
  var bucket = event.Records[0].s3.bucket.name;
  //console.log('###srcKeybefore', srcKey);
  var srcVideo = srcKey.split('/');
    console.log('###src key ', srcVideo, srcVideo.length);
    var dstKey = '';
    for ( var i=0; i< srcVideo.length -1; i++) {
        dstKey += srcVideo[i] + '/';
    }
  dstKey += "Thumb_" + srcVideo[srcVideo.length - 1];
  console.log('###dstKey', dstKey);
  var dstKeyname = dstKey.replace(/\.\w+$/, ".jpg");
  //console.log('###srcKeyafter', srcKey);
  var fileType = srcKey.match(/\.\w+$/);
  //console.log('###fileType', fileType);
  var target = s3.getSignedUrl("getObject",{Bucket:bucket, Key:srcKey, Expires: 900}); 
  console.log('###target', target);
  var metadata = {Width: 0, Height: 0};
  //if(srcKey.indexOf(thumbKeyPrefix) === 0) {
    //return;
  //}

  if (fileType === null) {
    context.fail("Invalid filetype found for key: " + srcKey);
    return;
  }

  fileType = fileType[0].substr(1);
  
  if (allowedFileTypes.indexOf(fileType) === -1) {
    context.fail("Filetype " + fileType + " not valid for thumbnail, exiting");
    return;
  }
  async.waterfall([

      function createThumbnail(next) {

        var width = thumbWidth,
         height = thumbHeight;
        var ffmpeg = child_process.spawn("ffmpeg", [
          "-ss","00:00:05", // time to take screenshot
          "-i", target, // url to stream from
          "-vf", "thumbnail,scale="+thumbWidth+":"+thumbHeight, 
          "-qscale:v" ,"2",
          "-frames:v", "1",
          "-f", "image2",
          "-c:v", "mjpeg",
          "pipe:1"
        ]);
        ffmpeg.on("error", function(err) {
          console.log('ffmpeg error',err);
        })
        ffmpeg.on("close", function(code) {
          if (code != 0 ) {
            console.log("child process exited with code " + code);
          } else {
            console.log("Processing finished !");
          }
          tmpFile.end(); 
          next(code);
        });
        tmpFile.on("error", function(err) {
          console.log("stream err: ", err);
        });
        ffmpeg.on("end", function() {
          tmpFile.end();  
        })
        ffmpeg.stdout.pipe(tmpFile)
        .on("error", function(err){
          console.log("error while writing: ",err);
        });
      },
  
      function uploadThumbnail(next) {
        var tmpFile =  fs.createReadStream("/tmp/screenshot.jpg");
        child_process.exec("echo `ls -l -R /tmp`",
          function (error, stdout, stderr) {
            console.log("stdout: " + stdout) // for checking on the screenshot
          });
        var params ={
            Bucket: bucket,
            Key: dstKeyname,
            Body: tmpFile,
            ContentType: "image/jpg",
            //ACL: "public-read",
            Metadata: {
              thumbnail: "TRUE"
            }
          };
        
        var uploadMe = s3.upload(params);
        uploadMe.send(
          function(err, data) {
          if (err != null) console.log("error: " +err);
          next(err);
          }
        );
      }
    ],
    function(err) {
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