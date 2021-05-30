var AWS = require('aws-sdk');
var http = require('http');
var s3 = new AWS.S3();
var user;
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var lensmediaBucket;

exports.handler = (event, context, callback) => {
  var envReq = getParameterFromSystemManager();
  envReq.then(() => {
    // TODO implement
    var path = '/patient/procedure/recover';
    const options = {
      host: environment['API_host'],
      port: environment['API_port'],
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'lambda': '#1234lambd@_tr1gger4321#'
      }
    };
    lensmediaBucket = environment['envprefix'] + '-lensmediabucket';

    const req = http.request(options, (res) => {
      console.log('Web service called and response code--', res.statusCode);
      if (res.statusCode == 200) {
        var str = '';
        res.on('data', function (chunk) {
          str += chunk;
        });

        res.on('end', () => {
          var response = JSON.parse(str);

          console.log(response);
          for (var i = 0; i < response.length; i++) {
            updateRecoverStatus(response[i]['gpid'], response[i]['surgeonid']);
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
  }).catch((err) => {
    console.log('GetSSMParam-error', err);
  });
};


function updateRecoverStatus(gpid, surgeonid) {
  var flag = true;
  var path = '/patient/procedure/' + gpid;
  const options = {
    host: environment['API_host'],
    port: environment['API_port'],
    path: path,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Random token',
      'lambda': '#1234lambd@_tr1gger4321#',
      'surgeonid': surgeonid
    }
  };

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

                        var params = {
                          Bucket: lensmediaBucket,
                          Key: glabalannotationsitems[key]
                        };

                        s3.headObject(params, function (err, metadata) {
                          if (err && err.code === 'NotFound') {
                            flag = false;

                          }
                        });

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
                    for (var key in item1) {

                      if (key == 'fileurl') {
                        if (item1[key] != undefined) {
                          var params = {
                            Bucket: lensmediaBucket,
                            Key: item1[key]
                          };

                          s3.headObject(params, function (err, metadata) {
                            if (err && err.code === 'NotFound') {
                              flag = false;

                            }
                          });

                        }
                      }
                      if (key == 'annotations') {

                        var localAnnotations = item1[key];

                        localAnnotations.forEach((localannotationsItem, index) => {
                          for (var key in localannotationsItem) {

                            if (key == 'fileurl') {
                              if (localannotationsItem[key] != undefined) {
                                var params = {
                                  Bucket: lensmediaBucket,
                                  Key: localannotationsItem[key]
                                };

                                s3.headObject(params, function (err, metadata) {
                                  if (err && err.code === 'NotFound') {
                                    flag = false;

                                  }
                                });
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

        if (flag) {
          updateStatus(gpid, 4);
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


function updateStatus(gpid, status) {
  const options = {
    host: environment['API_host'],
    port: environment['API_port'],
    path: '/patient/procedure/delete/recover',
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'lambda': '#1234lambd@_tr1gger4321#'
    }
  };

  var bodyString = JSON.stringify({
    'gpid': gpid,
    'status': status
  });
  //	 http.request(options, putCallback).write(bodyString);

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
}

var putCallback = function (response) {
  var statusCode = response.statusCode;
  console.log(statusCode);
  var str = '';
  //another chunk of data has been recieved, so append it to `str`
  response.on('data', function (chunk) {
    str += chunk;
  });

  //the whole response has been recieved, so we just print it out here
  response.on('end', function () {

    if (statusCode == 202) {
      console.log('Success in updating recover status of the proceduer : ');
    } else {
      console.error('Error in updating recover status of the proceduer: ');
    }
  });
};

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