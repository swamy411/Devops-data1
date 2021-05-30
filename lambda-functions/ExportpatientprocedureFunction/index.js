var AWS = require('aws-sdk');
var http = require('http');
var moment = require('moment-timezone');
AWS.config.update({region:'us-east-1'});
var s3 = new AWS.S3();
var user;
var lambda = new AWS.Lambda({
  region: 'us-east-1'
});
var ssm = new AWS.SSM({region:'us-east-1'});
var envPath = process.env.ssm_store;
var environment = {};
var exportBucket;

exports.handler = (event, context, callback) => {
  var envReq = getParameterFromSystemManager();
  envReq.then(() => {
    console.log('-after----environment----', environment);
    exportBucket = environment['envprefix'] + '-exportprocedurebucket';
    lambda.invoke({
      FunctionName: environment['envprefix']+'_ClearExistingExportZip',
      Payload: JSON.stringify(event)
    }, function (err, data) {
      console.log('Function call');
      if (err) {
        console.log(' Error in deleting file : ' + err);
        //   callback(err, null);
      } else if (data) {
        console.log('Zip file deleted ', data);
        //   return callback(null, '{"code": "200"}');
        //   callback(null, data);

        var patientviewObject = event['selectItem'];
        console.log('Received JSON---', event['selectItem']);

        var path1 = '/patient/procedure/';
        var gpid = event['gpid'];
        var foldername = event['mrnnumber'];
        console.log('Received Gpid---', event['gpid']);
        var surgeonname = event['surgeonname'];
        console.log('Received Surgeonname---', event['surgeonname']);
        var resPath = path1.concat(gpid);
        console.log('URL path----', resPath);
        var tokenId = event['tokenId'];
        console.log('IdToken---', tokenId);
        var lambdacall = event['lambda'];
        var timeZone = event['timezone'];
        var ownerId = event['ownerId'];
        console.log('folderName---', foldername);
        console.log('timeZone---', timeZone);

        if (timeZone == undefined) {
          timeZone = 'Asia/Kolkata'
        }


        if (patientviewObject == undefined) {
          if (lambdacall != undefined) {
            var header = {
              'Content-Type': 'application/json',
              'Authorization': tokenId,
              'surgeonid': surgeonname,
              'lambda': '#1234lambd@_tr1gger4321#'

            }
          } else {
            var header = {
              'Content-Type': 'application/json',
              'Authorization': tokenId,

            }
            if (!!surgeonname) {
              header['surgeonid'] = surgeonname;
            }
            if (!!ownerId) {
              header['ownerId'] = ownerId;
            }
          }
          console.log('#### Header ', header);
          const options = {
            host: environment['API_host'],
            port: environment['API_port'],
            path: resPath,
            method: 'GET',
            headers: header
          };
          console.log('#### Options ', options);
          const req = http.request(options, (res) => {
            console.log('Web service called and response code--', res.statusCode);
            if (res.statusCode == 200) {
              var str = '';
              res.on('data', function (chunk) {
                str += chunk;
                console.log('### chunk ', str);
              });

              res.on('end', function (chunk) {
                user = JSON.parse(str);
                console.log(user);

                var obj = user;
                console.log('Object from Json--', obj);
                copyMedias(obj, surgeonname, foldername, timeZone);

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
        } else {
          copyMedias(patientviewObject, surgeonname, foldername, timeZone);
        }

        callback(null, 'pass');

      }
    });

  }).catch((err) => {
    console.log('GetSSMParam-error', err);
  });
};

function createPatienttxt(surgeonname, foldername, newPatientObj) {
  var myKey = foldername + '/patientinfo.xml';
  //var params = {Bucket: 'dev-exportprocedurebucket', Key: myKey, Body: jsonxml(JSON.parse(JSON.stringify(newPatientObj)))};
  var params = {
    Bucket: exportBucket,
    Key: myKey,
    Body: newPatientObj
  };

  s3.putObject(params, function (err, data) {

    if (err) {
      console.log(err)
    } else {
      console.log("Successfully created patient procedure text file-", myKey);

    }
  });

}

function copyObject(copySource, bucket, key) {
    return new Promise((resolve, reject) => {
        s3.copyObject({
            CopySource: copySource,
            Bucket: bucket,
            Key: key
          }, (copyErr, copyData) => {
            if (copyErr) {
              console.log("#Error in copying --", copySource, copyErr);
            //   copyglobalflag = false;
             reject(false);
            } else {
              console.log('#Copied key ' , key, ' #bucket ', bucket, '#Copy source ', copySource,' #Data ', copyData);
              resolve(true);
            }
          });
     })
}

async function copyMedias(obj, surgeonname, foldername, timeZone, callback) {
  console.log('timeZone*********', timeZone)
  var srcBucket = environment['envprefix'] + '-lensmediabucket';
  var destBucket = exportBucket+ "/" + foldername;
  var newPatientObj = [];
  var copyglobalflag = true;
  var firstnameString = undefined;
  var lastnameString = undefined;
  var surgeonFirstname = undefined;
  var surgeonLastname = undefined;
  var strXML = "<?xml version='1.0'?><PatientInfo>";
  for (var i in obj) {
    if (i == 'patientprocedureid') {
      var newObj = obj[i];
      newPatientObj.push("gpid:" + newObj);
      strXML = strXML + "<gpid>" + newObj + "</gpid>";
    }
    if (i == 'patientinfo') {
      var newObj = obj[i];
      Object.keys(newObj).forEach(function (key) {
        var val = newObj[key];
        if (key != 'patientid') {
          if (key == 'firstname') {
            console.log('Firstname-----', newObj[key]);
            if (newObj[key] != undefined && newObj[key] != '') {
              firstnameString = newObj[key];
            }
          } else if (key == 'lastname') {
            console.log('lastname-----', newObj[key]);
            if (newObj[key] != undefined && newObj[key] != '') {
              lastnameString = newObj[key];
            }
          } else if (newObj[key] == '_createpatient_label_male') {
            newPatientObj.push(key + ':' + 'male');
            strXML = strXML + "<gender>male" + "</gender>";
          } else if (newObj[key] == '_createpatient_label_female') {
            newPatientObj.push(key + ':' + 'female');
            strXML = strXML + "<gender>female" + "</gender>";
          } else if (key != 'creationdate') {
            newPatientObj.push(key + ':' + newObj[key]);
            if (newObj[key] != undefined) {
              strXML = strXML + '<' + key + '>' + newObj[key] + '</' + key + '>';
            }

          }
        }
      });
      console.log('firstnameString---', firstnameString);
      console.log('lastnameString---', firstnameString);
      if (firstnameString != undefined && lastnameString != undefined) {
        strXML = strXML + "<patientname>" + lastnameString + ',' + firstnameString + "</patientname>";
      } else if (firstnameString == undefined && lastnameString != undefined) {
        strXML = strXML + "<patientname>" + lastnameString + "</patientname>";
      } else if (firstnameString != undefined && lastnameString == undefined) {
        strXML = strXML + "<patientname>" + firstnameString + "</patientname>";
      } else {
        strXML = strXML + "<patientname>" + '' + "</patientname>";
      }

    }

    if (i == 'procedureinfo') {
      var newObj = obj[i];
      Object.keys(newObj).forEach(function (key) {
        var val = newObj[key];
        if (key == 'time') {
          console.log('Key---', key);
          console.log('newObj[key]--', newObj[key]);
          if (newObj[key] !== '00:00:00') {
            console.log('Inside--', newObj[key])
            var timeVal = newObj[key];
            newPatientObj.push('time' + ':' + timeVal);
            strXML = strXML + '<time>' + timeVal + '</time>';
          }
        }
        if (key != 'miscellanousdata' && key !== 'annotations' && key !== 'setupblob' && key !== 'time' && key !== 'tags' && key !== 'surgeonname') {
          newPatientObj.push(key + ':' + newObj[key]);
          if (key == 'firstname') {
            if (newObj[key] != undefined && newObj[key] != '') {
              surgeonFirstname = newObj[key];
            }

            //   strXML = strXML + '<surgeonfirstname>'+ newObj[key] + '</surgeonfirstname>';			
          } else if (key == 'lastname') {
            if (newObj[key] != undefined && newObj[key] != '') {
              surgeonLastname = newObj[key];
            }

            //  strXML = strXML + '<surgeonlastname>'+ newObj[key] + '</surgeonlastname>';			
          } else if (key == 'uploadeddate') {
            //var stag = newObj[key];
            //strXML = strXML + '<surgeonlastname>'+ newObj[key] + '</surgeonlastname>';                   				
            console.log('uploaded---', key);
            console.log('uploaded vval---', newObj[key]);
            console.log('timezone---', timeZone);
            strXML = strXML + '<' + key + '>' + toTimeZone(newObj[key], timeZone) + '</' + key + '>';
            // console.log('logs----',toTimeZone(newObj[key],timeZone));				
          } else {
            strXML = strXML + '<' + key + '>' + newObj[key] + '</' + key + '>';
          }

        }

        if (key == 'setupblob') {
          var newObj1 = newObj[key];
          Object.keys(newObj1).forEach(function (key) {
            if (key == 'blobname') {
              newPatientObj.push('towersetupname' + ':' + newObj1[key]);
              strXML = strXML + "<towersetupname>" + newObj1[key] + "</towersetupname>";
            }

          });

        }
      });

      if (surgeonFirstname != undefined && surgeonLastname != undefined) {
        strXML = strXML + "<surgeonname>" + surgeonLastname + ',' + surgeonFirstname + "</surgeonname>";
      } else if (surgeonFirstname == undefined && surgeonLastname != undefined) {
        strXML = strXML + "<surgeonname>" + surgeonLastname + "</surgeonname>";
      } else if (surgeonFirstname != undefined && surgeonLastname == undefined) {
        strXML = strXML + "<surgeonname>" + surgeonFirstname + "</surgeonname>";
      } else {
        strXML = strXML + "<surgeonname>" + '' + "</surgeonname>";
      }

      strXML = strXML + "</PatientInfo>";
      for (var k in newObj) {
        if (k == 'annotations') {
          var glabalannotations = newObj[k];

          glabalannotations.forEach((glabalannotationsitems, index) => {

            for (var key in glabalannotationsitems) {
              if (key == 'fileurl') {
                var objectPath = glabalannotationsitems[key];

                var lastSpecialPosition = objectPath.lastIndexOf("/");

                var destKey = objectPath.substring(lastSpecialPosition + 1, objectPath.length);
                console.log('destKey-----', destKey);
                console.log('global key----', glabalannotationsitems[key]);
                console.log('srcBucket----', srcBucket);
                console.log('destBucket----', destBucket);
                var copySource = srcBucket + '/' + glabalannotationsitems[key];
                copyObject(copySource, destBucket, destKey);                

              }


            }

          });

        }

      }
    }
    if (i == 'camerasettings') {
      var newObj = obj[i];

      newObj.forEach((item, index) => {
        for (var key in item) {
          if (key == 'media') {

            var newObj1 = item[key];
            newObj1.forEach((item1, index) => {
              for (var key in item1) {

                if (key == 'fileurl') {

                  var mediaPath = item1[key];
                  console.log(mediaPath);
                  var lastIndexMedia = mediaPath.lastIndexOf("/");

                  var destMediaKey = mediaPath.substring(lastIndexMedia + 1, mediaPath.length);
                  console.log(destMediaKey);
                  var copySourceMedia = srcBucket + '/' + item1[key];
                  copyObject(copySourceMedia, destBucket, destMediaKey);
                 
                }
                if (key == 'annotations') {

                  var localAnnotations = item1[key];

                  localAnnotations.forEach((localannotationsItem, index) => {
                    for (var key in localannotationsItem) {

                      if (key == 'fileurl') {

                        var localannotationpath = localannotationsItem[key];

                        var lastIndexLocal = localannotationpath.lastIndexOf("/");

                        var destLocalKey = localannotationpath.substring(lastIndexLocal + 1, localannotationpath.length);
                        var copySourceMediaGlobal = srcBucket + '/' + localannotationsItem[key];
                        copyObject(copySourceMediaGlobal, destBucket, destLocalKey);                       

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

  };

  //createPatienttxt(surgeonname,foldername,newPatientObj);
  createPatienttxt(surgeonname, foldername, strXML);




}


function toTimeZone(time, zone) {
  var formatString = 'MM/DD/YYYY HH:mm:ss';
  var localDate = moment(new Date(time), formatString).tz(zone).format(formatString);
  return localDate;
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