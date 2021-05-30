var async = require('async');
var http = require('http');
//var https = require('https');
var AWS = require('aws-sdk');
AWS.config.update({region:'us-east-1'});
var s3 = new AWS.S3({ apiVersion: '2006-03-01' });
var lambda = new AWS.Lambda({
  region: 'us-east-1' 
});
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};

var bucket;
var key;
var gpid;
var mediaid;
var surgeonname;
var annotationid;
var accountId;
var bodyString = '';
var apipath;
var isdeviceblob;

//Lambda entry point
exports.handler = function(event, context) {
  var envReq = getParameterFromSystemManager();
  envReq.then(() => {
    accountId = JSON.stringify(context.invokedFunctionArn).split(':')[4];
    console.log('putCallback');
    console.log(event.Records[0].s3.bucket.name);
    lambda.invoke({FunctionName: environment['envprefix']+'_ImageThumbnailerFunction', Payload: JSON.stringify(event)}, function (err, data) {
                console.log('Function call');
                if (err) {
                  console.log(' Image Thumbnail error : ' + err);
                //   callback(err, null);
                } else if (data) {
                  console.log('Image Thumbnail data ',data);
                //   return callback(null, '{"code": "200"}');
                //   callback(null, data);
                }
            });
    lambda.invoke({FunctionName: environment['envprefix']+'_VideoThumbnailerFunction', Payload: JSON.stringify(event)}, function (err, data) {
        console.log('Function call');
        if (err) {
          console.log(' Video Thumbnail error : ' + err);
        //   callback(err, null);
        } else if (data) {
          console.log('Video Thumbnail data ',data);
        //   return callback(null, '{"code": "200"}');
        //   callback(null, data);
        }
    });
    
    lambda.invoke({FunctionName: environment['envprefix']+'_ImageConversion', Payload: JSON.stringify(event)}, function (err, data) {
        console.log('Function call');
        if (err) {
          console.log(' Image Convertion error : ' + err);
          //callback(err, null);
        } else if (data) {
          console.log('Image Convertion data ',data);
        //   return callback(null, '{"code": "200"}');
          //callback(null, data);
        }
    });
    
    lambda.invoke({FunctionName: environment['envprefix']+'_VideoConversion', Payload: JSON.stringify(event)}, function (err, data) {
        console.log('Function call');
        if (err) {
          console.log(' Video Convertion error : ' + err);
          //callback(err, null);
        } else if (data) {
          console.log('Video Convertion data ',data);
        //   return callback(null, '{"code": "200"}');
          //callback(null, data);
        }
    });
    lambda.invoke({FunctionName: environment['envprefix']+'_AudioConverterFunction', Payload: JSON.stringify(event)}, function (err, data) {
        console.log('Function call');
        if (err) {
           console.log(' Audio Convertion error : ' + err);
           //callback(err, null);
        } else if (data) {
          console.log('Audio Convertion data ',data);
        //   return callback(null, '{"code": "200"}');
           //callback(null, data);
        }
    });
    
    console.log('End of putCallback');
	//S3 sends a batch of events.  Need to handle the possibility of mutliple upload events
    async.each(event.Records, processSingleEventRecord, context.done);

  }).catch((err) => {
    console.log('GetSSMParam-error', err);
  });
};

//Generic function to fetch the header, and extract the parameters
var processSingleEventRecord = function(event, callback, context){

    bucket = event.s3.bucket.name;
    key = decodeURIComponent(event.s3.object.key.replace(/\+/g, ' '));
    var params = {
        Bucket: bucket,
        Key: key
    };
    console.log('Put event received for bucket: ' + bucket + ', key: ' + key);

    //Get the header info for the upload
    s3.headObject(params, function(err, data) {
        if (err) {
            var error_message = 'Error in getting  metadata for bucket: ' + bucket 
                    + ', key: ' + key + ', Error: ' + err;
            console.error(error_message);
            callback(error_message);
        } else {
            gpid = data.Metadata['gpid'];
            mediaid = data.Metadata['mediaid'];
            surgeonname = data.Metadata['surgeonname'];
            annotationid = data.Metadata['annotationid'];
            isdeviceblob = data.Metadata['isdeviceblob'];
            
            console.log('gpid--',gpid);
            console.log('surgeonname--',gpid);
             console.log('annotationid--',annotationid);
             console.log('mediaid--',mediaid);
             console.log('isdeviceblob--',isdeviceblob);
             console.log('Key--',key);
            
            var fileType = key.match(/\.\w+$/);
            fileType = fileType[0].substr(1);
            let allowedFileTypes = ['html', 'html'];
            console.log("Key####", key);
            if(!data.ContentType.includes('text/html') && allowedFileTypes.indexOf(fileType) >=0) {
                console.log('only text annotation');
                const params = {
                   Bucket: bucket,
                   Key: key,
                };
                
                s3.getObject(params, (err, getData) => {
                     if (err) {
                      console.log('Text annotation get object error' + err);
                     } else {
                      // the data has the content of the uploaded file
                         console.log('Get object ', getData.Body.toString());
                         s3.putObject({
                            Body: getData.Body.toString(),
                            Bucket: bucket,
                            Key: key,
                            Metadata: data.Metadata,
                            ContentType: 'text/html',
                          }, (error, data) => {
                            console.log("Error in put object ",error);
                            console.log("Result in data ", data);
                          });
                     }
                 });
                
            }
         
           
            console.log('Success in getting metadata for bucket: ' + bucket + ', key: ' + key 
                            + ', gpid: ' + gpid + ', mediaid: ' + mediaid, 'surgeonname: '+surgeonname , 'annotationid: '+annotationid);
            
            var bodyStringforMedia = JSON.stringify({
                'gpid': gpid,
                'mediaid': mediaid,
                'mediafilepath': key,
                'surgeonname': surgeonname
            });
            
            var bodyStringforGlobalAnnotation = JSON.stringify({
                'gpid': gpid,
                'annotationid': annotationid,
                'annotationfilepath': key,
                'surgeonname': surgeonname
            });
            
            var bodyStringforLocalAnnotation = JSON.stringify({
                'gpid': gpid,
                'mediaid': mediaid,
                'annotationid': annotationid,
                'annotationfilepath': key,
                'surgeonname': surgeonname
            });
            
             var bodyStringforDeviceBlob = JSON.stringify({
                'gpid': gpid,
                'blobid': mediaid,
                'blobpath': key,
                'surgeonname': surgeonname
            });
            
           if(isdeviceblob){
               bodyString = bodyStringforDeviceBlob;
               apipath = '/patient/procedure/deviceblob';
           }else if(mediaid!=undefined && annotationid==undefined){
               bodyString = bodyStringforMedia;
               apipath = '/patient/procedure/media';
           } else if(mediaid==undefined && annotationid!=undefined){
               bodyString = bodyStringforGlobalAnnotation;
               apipath = '/patient/procedure/annotation/global';
           } else if(mediaid!=undefined && annotationid!=undefined){
                bodyString = bodyStringforLocalAnnotation;
                apipath = '/patient/procedure/annotation/local';
           } 

            var headers = {
                'Content-Type': 'application/json',
                'Content-Length': bodyString.length,
                //'Auth': 'kddjfsd;fjweirwesdfjsd#jfw' + accountId + 'eijrr2304@9u9u23f$jwqwe2vxcdwecs'
                'Actor' : surgeonname,
                'lambda': '#1234lambd@_tr1gger4321#'
            };
            if(apipath) {
            var options = {
                //host: 'ec2-35-172-158-187.compute-1.amazonaws.com',
                host: environment['API_host'],
                path: apipath,
                //host: 'i555dc0s38.execute-api.us-east-1.amazonaws.com',
                //path: '/dev/patient/procedure/media',
                port: environment['API_port'],
                method: 'PUT',
                headers: headers
            };
             console.log('apipath: '+apipath + 'bodyString: '+bodyString);
            http.request(options, putCallback).write(bodyString);
            }
        }
    });
    
    var putCallback = function(response) {
        var statusCode = response.statusCode; 
        console.log(statusCode);
        var str = '';
        //another chunk of data has been recieved, so append it to `str`
        response.on('data', function(chunk) {
            str += chunk;
        });
        
        //the whole response has been recieved, so we just print it out here
            response.on('end', function() {
                
                if(statusCode == 202) {
                    console.log('Success in updating metadata for bucket: ' + bucket + ', key: ' + key 
                         + ', gpid: ' + gpid + ', mediaid: ' + mediaid + ' annotationid: ' + annotationid + ', Response: ' + str);
                } else {
                    console.error('Error in updating metadata for bucket: ' + bucket + ', key: ' + key 
                         + ', gpid: ' + gpid + ', mediaid: ' + mediaid + ' annotationid: ' + annotationid + ', Response: ' + str);
                }
        });
    };    
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