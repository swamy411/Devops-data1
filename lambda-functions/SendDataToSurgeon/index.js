let AWS = require('aws-sdk');
var http = require('http');
var s3 = new AWS.S3();
const fs = require('fs');
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var lensmediaBucket;
var sendtoSurgeonBucket;

exports.handler = (event, context, callback) => {
  var envReq = getParameterFromSystemManager();
  envReq.then(() => {
    // TODO implement
    lensmediaBucket = environment['envprefix'] + '-lensmediabucket';
    sendtoSurgeonBucket = environment['envprefix'] + '-senddatasurgeon';
    copyObjectstoTempBucket(event['gpid'], event['surgeonid'], callback);
  }).catch((err) => {
    console.log('GetSSMParam-error', err);
  });
};



function copyObjectstoTempBucket(gpid, surgeonid, callback) {
  var foldername = surgeonid + Date.now();
  var path = '/patient/procedure/' + gpid;
  var imageset = [];
  var videoset = [];
  var reports = [];
  const options = {
    host: environment['API_host'],
    port: environment['API_port'],
    path: path,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'lambdatoken',
      'lambda': '#1234lambd@_tr1gger4321#',
      'surgeonid': surgeonid
    }
  };
  console.log("Before http request");

  const req = http.request(options, (res) => {

    console.log('Web service called and response code--', res.statusCode);
    if (res.statusCode == 200) {
      var str = '';
      res.on('data', function (chunk) {
        str += chunk;
      });

      res.on('end', () => {
        var obj = JSON.parse(str);

        console.log('--- Str json after append ---', str);


        fs.writeFile('/tmp/proceduredetails.json', str, function (err) {
          if (err) {
            return console.log(err);
          } else {
            var param = {
              Bucket: sendtoSurgeonBucket,
              Key: foldername + '/' + 'proceduredetails.json',
              Body: fs.createReadStream('/tmp/proceduredetails.json'),

            };

            putObject(param);
          }
        });

        for (var i in obj) {
          if (i == 'procedureinfo') {
            var newObj = obj[i];
            for (var k in newObj) {
              if (k == 'annotations') {
                var glabalannotations = newObj[k];

                glabalannotations.forEach((glabalannotationsitems, index) => {

                  for (var key in glabalannotationsitems) {
                    if (key == 'fileurl') {
                      if (glabalannotationsitems[key] != undefined) {
                        var innerpath = glabalannotationsitems[key];
                        var objectPath = lensmediaBucket+'/' + glabalannotationsitems[key];
                        var lastSpecialPosition = objectPath.lastIndexOf("/");
                        var destination = sendtoSurgeonBucket + '/' + foldername + '/' + innerpath.substring(0, innerpath.lastIndexOf("/"));
                        console.log(destination);
                        var destKey = objectPath.substring(lastSpecialPosition + 1, objectPath.length);
                        console.log('before calling global---', innerpath);
                        copyObject(objectPath, destination, destKey, innerpath);
                      }
                    }
                  }

                });

              }

            }
          }

          if (i == 'camerasettings') {
            var camerasettings = obj[i];

            camerasettings.forEach((item, index) => {
              for (var key in item) {
                if (key == 'media') {
                  var media = item[key];
                  media.forEach((item1, index) => {

                    var filetype = item1['filetype'];

                    if (filetype == 'IMAGE') {
                      imageset.push(item1);
                    } else if (filetype == 'VIDEO') {
                      videoset.push(item1);
                    } else {
                      reports.push(item1);
                    }

                  });

                }


              }

            });

          }


        }


        imageset.forEach((imageKey, index) => {
          for (var key in imageKey) {

            if (key == 'fileurl') {
              if (imageKey[key] != undefined) {
                var innerpath = imageKey[key];
                var mediaPath = lensmediaBucket+'/' + imageKey[key];
                var lastIndexMedia = mediaPath.lastIndexOf("/");
                var destinationMedia = sendtoSurgeonBucket + '/' + foldername + '/' + innerpath.substring(0, innerpath.lastIndexOf("/"));

                console.log(destinationMedia);
                var destMediaKey = mediaPath.substring(lastIndexMedia + 1, mediaPath.length);
                console.log('before calling media---', innerpath);
                copyObject(mediaPath, destinationMedia, destMediaKey, innerpath);
                var source = lensmediaBucket+'/' + getImageThumbnailPath(innerpath);
                var destination = sendtoSurgeonBucket + '/' + foldername + '/' + getImageThumbnailPath(innerpath).substring(0, innerpath.lastIndexOf("/"));
                console.log('Thumbnail source--', source);
                console.log('Thumbnail Destination--', destination);
                copyObject(source, destination, getKey(getImageThumbnailPath(innerpath)), getImageThumbnailPath(innerpath));



              }
            }
            if (key == 'annotations') {

              var localAnnotations = imageKey[key];

              localAnnotations.forEach((localannotationsItem, index) => {
                for (var key in localannotationsItem) {

                  if (key == 'fileurl') {
                    if (localannotationsItem[key] != undefined) {
                      var innerpath = localannotationsItem[key];
                      var localannotationpath = lensmediaBucket+'/' + localannotationsItem[key];
                      var lastIndexLocal = localannotationpath.lastIndexOf("/");
                      var destinationLocal = sendtoSurgeonBucket + '/' + foldername + '/' + innerpath.substring(0, innerpath.lastIndexOf("/"));

                      console.log(destinationLocal);
                      var destLocalKey = localannotationpath.substring(lastIndexLocal + 1, localannotationpath.length);
                      console.log('before calling local---', innerpath);
                      copyObject(localannotationpath, destinationLocal, destLocalKey, innerpath);

                      var sourcelocal = getImageThumbnailPath(localannotationpath);
                      console.log('Thumbnail source local--', sourcelocal);
                      console.log('Thumbnail Destination local --', destinationLocal);
                      console.log('Thumbnail key local---', getKey(getImageThumbnailPath(localannotationpath)));
                      copyObject(sourcelocal, destinationLocal, getKey(getImageThumbnailPath(localannotationpath)), getImageThumbnailPath(localannotationpath));


                    }
                  }
                }
              });

            }
          }
        });

        videoset.forEach((videokey, index) => {
          for (var key in videokey) {

            if (key == 'fileurl') {
              if (videokey[key] != undefined) {
                var innerpath = videokey[key];
                var mediaPath = lensmediaBucket+'/' + videokey[key];
                var lastIndexMedia = mediaPath.lastIndexOf("/");
                var destinationMedia = sendtoSurgeonBucket + '/' + foldername + '/' + innerpath.substring(0, innerpath.lastIndexOf("/"));

                console.log(destinationMedia);
                var destMediaKey = mediaPath.substring(lastIndexMedia + 1, mediaPath.length);
                console.log('before calling media---', innerpath);
                copyObject(mediaPath, destinationMedia, destMediaKey, innerpath);
                var source = lensmediaBucket+'/' + getVideoThumbnailPath(innerpath);
                var destination = sendtoSurgeonBucket + '/' + foldername + '/' + getVideoThumbnailPath(innerpath).substring(0, innerpath.lastIndexOf("/"));
                console.log('Thumbnail source--', source);
                console.log('Thumbnail Destination--', destination);
                copyObject(source, destination, getKey(getVideoThumbnailPath(innerpath)), getVideoThumbnailPath(innerpath));



              }
            }

            if (key == 'annotations') {

              var localAnnotations = videokey[key];

              localAnnotations.forEach((localannotationsItem, index) => {
                for (var key in localannotationsItem) {

                  if (key == 'fileurl') {
                    if (localannotationsItem[key] != undefined) {
                      var innerpath = localannotationsItem[key];
                      var localannotationpath = lensmediaBucket+'/' + localannotationsItem[key];
                      var lastIndexLocal = localannotationpath.lastIndexOf("/");
                      var destinationLocal = sendtoSurgeonBucket + '/' + foldername + '/' + innerpath.substring(0, innerpath.lastIndexOf("/"));

                      console.log(destinationLocal);
                      var destLocalKey = localannotationpath.substring(lastIndexLocal + 1, localannotationpath.length);
                      console.log('before calling local---', innerpath);
                      copyObject(localannotationpath, destinationLocal, destLocalKey, innerpath);
                    }
                  }
                }
              });

            }
          }
        });


        reports.forEach((reportsKey, index) => {
          for (var key in reportsKey) {

            if (key == 'fileurl') {
              if (reportsKey[key] != undefined) {
                var innerpath = reportsKey[key];
                var mediaPath = lensmediaBucket+'/' + reportsKey[key];
                var lastIndexMedia = mediaPath.lastIndexOf("/");
                var destinationMedia = sendtoSurgeonBucket + '/' + foldername + '/' + innerpath.substring(0, innerpath.lastIndexOf("/"));

                console.log(destinationMedia);
                var destMediaKey = mediaPath.substring(lastIndexMedia + 1, mediaPath.length);
                console.log('before calling report---', innerpath);
                copyObject(mediaPath, destinationMedia, destMediaKey, innerpath);




              }
            }


            if (key == 'annotations') {

              var localAnnotations = reportsKey[key];

              localAnnotations.forEach((localannotationsItem, index) => {
                for (var key in localannotationsItem) {

                  if (key == 'fileurl') {
                    if (localannotationsItem[key] != undefined) {
                      var innerpath = localannotationsItem[key];
                      var localannotationpath = lensmediaBucket+'/' + localannotationsItem[key];
                      var lastIndexLocal = localannotationpath.lastIndexOf("/");
                      var destinationLocal = sendtoSurgeonBucket + '/' + foldername + '/' + innerpath.substring(0, innerpath.lastIndexOf("/"));

                      console.log(destinationLocal);
                      var destLocalKey = localannotationpath.substring(lastIndexLocal + 1, localannotationpath.length);
                      console.log('before calling local others---', innerpath);
                      copyObject(localannotationpath, destinationLocal, destLocalKey, innerpath);

                    }
                  }
                }
              });

            }

          }
        });

      });


    } else {
      console.log('Error from web service' + res.statusCode);
    }
  });


  req.on('error', (e) => {
    console.log('Error Message: ' + e.message);
  });

  console.log('End Data call');
  req.end();

  var apiResponse = {
    'foldername': foldername,

  };
  console.log('apiResponse----', apiResponse);

  callback(null, apiResponse);
}



function copyObject(source, destination, destKey, innerpath) {
  s3.copyObject({
    CopySource: source,
    Bucket: destination,
    Key: destKey,
  }, function (copyErr, copyData) {
    if (copyErr) {
      console.log("Error in copying object--", copyErr);
      console.log("Error in copying object key--", destKey);
    } else {
      console.log('ineerpath inside the method--', innerpath);
      console.log('Object copied--' + destKey);

    }
  });

}


function getKey(objectPath) {
  var lastSpecialPosition = objectPath.lastIndexOf("/");
  var destKey = objectPath.substring(lastSpecialPosition + 1, objectPath.length);
  return destKey;
}

function getImageThumbnailPath(objectPath) {
  var lastSpecialPosition = objectPath.lastIndexOf("/");
  return objectPath.substring(0, lastSpecialPosition) + '/Thumb_' + objectPath.substring(lastSpecialPosition + 1, objectPath.length);
}

function getVideoThumbnailPath(objectPath) {
  var lastSpecialPosition = objectPath.lastIndexOf("/");
  var videothumbPath = objectPath.substring(0, lastSpecialPosition) + '/Thumb_' + objectPath.substring(lastSpecialPosition + 1, objectPath.length);
  var lastDotPosition = videothumbPath.lastIndexOf(".");
  var pathAfterRemovingExtention = videothumbPath.replace(videothumbPath.substring(lastDotPosition + 1, videothumbPath.length), '');
  return pathAfterRemovingExtention + 'jpg';

}

function putObject(param) {
  s3.putObject(param, function (err, data) {
    if (err)
      console.log(err);
    else {
      console.log(data);

    }

  });
}

function getParameterFromSystemManager() {
  return new Promise((resolve, reject) => {
      var params = {
          Path: envPath,
          /* required */
          WithDecryption: false,
          Recursive: true
      };
      ssm.getParametersByPath(params, function (err, data) {
          if (err) {// an error occurred
              reject(false);
          }
          else {// successful response
              let dataEnv = data.Parameters ? data.Parameters : [];
              let env = {};
              dataEnv.forEach((eachItem) => {
                  let key = eachItem.Name;
                  key = key.replace(envPath , '');
                  key = key.replace('/', '_');
                  env[key] = eachItem.Value;
              });
              environment = env;
              resolve(true);
          }
      });
  });
}