let AWS = require('aws-sdk');
var http = require('http');
var s3 = new AWS.S3();
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var lensmediaBucket;
var procedureArchiveBucket;

exports.handler = function (event, context) {
  var envReq = getParameterFromSystemManager();
    envReq.then(() => {
      console.log('--event---', event);
      lensmediaBucket = environment['envprefix'] + '-lensmediabucket';
      procedureArchiveBucket = environment['envprefix'] + '-patientprocedure-archive';
      event.Records.forEach(record => {
        const {
          body
        } = record;
        console.log(body);

        //console.log("Message ID:" + record.MessageId);
        //console.log("Event Source:" + record.EventSource);

        let messageBody = JSON.parse(body);

        var gpid = messageBody.gpid;
        var tokenid = messageBody.tokenid;
        var surgeonid = messageBody.surgeonid;
        var lambda = messageBody.lambda;
        console.log("Before updating in main GPID:" + messageBody.gpid);
        for (var i = 0; i < gpid.length; i++) {
          updateStatus(gpid[i], 'Archive In Progress', tokenid, surgeonid, lambda);
          archiveProcedure(gpid[i], tokenid, surgeonid, lambda);
          console.log("after updating in main GPID:" + gpid[i]);
        }

      });
      console.log("Before return");
      return {};
    }).catch((err) => {
      console.log('GetSSMParam-error', err);
    });
};


async function copyObject(source, destination, destKey, innerpath, archivalstatus) {
    return new Promise((resolve, reject) =>{
        s3.copyObject({
            CopySource: source,
            Bucket: destination,
            Key: destKey,
            StorageClass: 'GLACIER'
          }, (copyErr, copyData)=> {
            if (copyErr) {
              console.log("Error in copying object--", copyErr);
              archivalstatus = false;
              reject(false);
            } else {
              console.log('ineerpath inside the method--', innerpath);
              console.log('Object copied--' + destKey);
              var params = {
                  Bucket: lensmediaBucket,
                  Key: innerpath
              };
                    
              deleteObject(params);
              resolve(true);
                      
            }
          });
    }); 

}

function deleteObject(params) {
    return new Promise((resolve, reject) =>{ 
        s3.deleteObject(params, (err, data)=> {
            if (err) {
              console.log(err, err.stack); // an error occurred
              console.log('Error in deleting object--', params.Key);
              reject(err);
            } else {
              console.log(data); // successful response
              console.log('Object deleted--', params.Key);
              resolve(true);
            }
        
          });
    });
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


var putCallback = function (response) {
  var statusCode = response.statusCode;
  console.log('put call response--', statusCode);
  var str = '';
  //another chunk of data has been recieved, so append it to `str`
  response.on('data', function (chunk) {
    str += chunk;
  });

  //the whole response has been recieved, so we just print it out here
  response.on('end', function () {

    if (statusCode == 202) {
      console.log('Success in updating archival status of the proceduer : ', );
    } else {
      console.error('Error in updating archival status of the proceduer: ');
    }
  });
};

async function archiveProcedure(gpid, tokenId, surgeonid, lambda) {
  console.log("In archive 1" + gpid);
  console.log("In archive 1" + tokenId);
  var archivalstatus = true;
  var path = '/patient/procedure/' + gpid;
  var header;
  if (lambda != undefined) {
    header = {
      'Content-Type': 'application/json',
      'Authorization': tokenId,
      'surgeonid': surgeonid,
      'lambda': '#1234lambd@_tr1gger4321#'

    };
  } else {
    header = {
      'Content-Type': 'application/json',
      'Authorization': tokenId
    };
    if (surgeonid) {
      header['surgeonid'] = surgeonid;
    }
  }

  console.log('archiveProcedure****', header);
  const options = {
    host: environment['API_host'],
    port: environment['API_port'],
    path: path,
    method: 'GET',
    headers: header
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
                        var objectPath = lensmediaBucket + '/' + glabalannotationsitems[key];
                        var lastSpecialPosition = objectPath.lastIndexOf("/");
                        var destination = procedureArchiveBucket + '/' + innerpath.substring(0, innerpath.lastIndexOf("/"));
                        console.log(destination);
                        var destKey = objectPath.substring(lastSpecialPosition + 1, objectPath.length);
                        console.log('before calling global---', innerpath);
                        copyObject(objectPath, destination, destKey, innerpath, archivalstatus);
                        var params = {
                            Bucket: lensmediaBucket,
                            Key: innerpath
                          };
                    
                   //     deleteObject(params);
                      }
                    }
                  }

                });

              }

            }
          }
          console.log("In archive 2:" + i);
          if (i == 'camerasettings') {
            var camerasettings = obj[i];

            camerasettings.forEach((item, index) => {
              for (var key in item) {
                if (key == 'media') {

                  var media = item[key];
                  media.forEach((item1, index) => {
                    for (var key in item1) {

                      if (key == 'fileurl') {
                        if (item1[key] != undefined) {
                          var innerpath = item1[key];
                          var mediaPath = lensmediaBucket + '/' + item1[key];
                          var lastIndexMedia = mediaPath.lastIndexOf("/");
                          var destinationMedia = procedureArchiveBucket + '/' + innerpath.substring(0, innerpath.lastIndexOf("/"));

                          console.log(destinationMedia);
                          var destMediaKey = mediaPath.substring(lastIndexMedia + 1, mediaPath.length);
                          console.log('before calling media---', innerpath);
                          copyObject(mediaPath, destinationMedia, destMediaKey, innerpath, archivalstatus);
                          var params = {
                            Bucket: lensmediaBucket,
                            Key: innerpath
                          };
                    
                         // deleteObject(params);
                          var paramsImages = {
                            Bucket: lensmediaBucket,
                            Key: getImageThumbnailPath(innerpath)
                          };
                          deleteObject(paramsImages);

                          var paramsVideos = {
                            Bucket: lensmediaBucket,
                            Key: getVideoThumbnailPath(innerpath)
                          };
                          deleteObject(paramsVideos);

                        }
                      }
                      if (key == 'annotations') {

                        var localAnnotations = item1[key];

                        localAnnotations.forEach((localannotationsItem, index) => {
                          for (var key in localannotationsItem) {

                            if (key == 'fileurl') {
                              if (localannotationsItem[key] != undefined) {
                                var innerpath = localannotationsItem[key];
                                var localannotationpath = lensmediaBucket + '/' + localannotationsItem[key];
                                var lastIndexLocal = localannotationpath.lastIndexOf("/");
                                var destinationLocal = procedureArchiveBucket + '/' + innerpath.substring(0, innerpath.lastIndexOf("/"));

                                console.log(destinationLocal);
                                var destLocalKey = localannotationpath.substring(lastIndexLocal + 1, localannotationpath.length);
                                console.log('before calling local---', innerpath);
                                copyObject(localannotationpath, destinationLocal, destLocalKey, innerpath, archivalstatus);
                                var params = {
                                    Bucket: lensmediaBucket,
                                    Key: innerpath
                                  };
                            
                              //  deleteObject(params);
                            }
                            }
                          }
                        });

                      }
                    }

                  });

                }


              }

            });

          }


        }

        console.log(archivalstatus);

        if (archivalstatus == true) {
          console.log("In archive 3");
          updateStatus(gpid, 'Archive Completed', tokenId, surgeonid, lambda);

        }

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


}


function updateStatus(gpid, status, tokenId, surgeonid, lambda) {

  var header;
  if (lambda != undefined) {
    header = {
      'Content-Type': 'application/json',
      'Authorization': tokenId,
      'surgeonid': surgeonid,
      'lambda': '#1234lambd@_tr1gger4321#'

    };
  } else {
    header = {
      'Content-Type': 'application/json',
      'Authorization': tokenId,

    };
  }
  console.log('Status update****', header);
  const options = {
    host: environment['API_host'],
    port: environment['API_port'],
    path: '/patient/procedure/archive/restore',
    method: 'PUT',
    headers: header
  };

  let bodyString = JSON.stringify({
    'gpid': gpid,
    'procedurestatus': status,

  });
  console.log('update status function called bodystring: ' + bodyString);

  const req = http.request(options, (res) => {

    res.setEncoding('utf8');
    res.on('data', function (chunk) {
      console.log('Response: ' + chunk);

    });
    res.on('error', function (e) {
      console.log("Got error: " + e.message);

    });
  });

  // send the request
  req.write(bodyString);
  req.end();
  //	 http.request(options, putCallback).write(bodyString);



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
                  key = key.replace(envPath, '');
                  key = key.replace('/', '_');
                  env[key] = eachItem.Value;
              });
              environment = env;
              resolve(true);
          }
      });
  });
}