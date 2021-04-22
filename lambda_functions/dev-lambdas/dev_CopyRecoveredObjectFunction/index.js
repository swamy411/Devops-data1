var async = require('async');
var AWS = require('aws-sdk');
var s3 = new AWS.S3();
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var lensmediaBucket;
var archiveobjBucket;

//Lambda entry point
exports.handler = function(event, context) {
   var envReq = getParameterFromSystemManager();
   envReq.then(() => {
    lensmediaBucket = environment['envprefix'] + '-lensmediabucket';
    archiveobjBucket = environment['envprefix'] + '-lensarchiveobjects';
	//S3 sends a batch of events.  Need to handle the possibility of mutliple upload events
    async.each(event.Records, processSingleEventRecord, context.done);
   }).catch((err) => {
       console.log('GetSSMParam-error', err);
   });
};

// Generic function to fetch the header, and extract the parameters
var processSingleEventRecord = function(event, callback){

    var bucket = event.s3.bucket.name;
    var key = decodeURIComponent(event.s3.object.key.replace(/\+/g, ' '));
    var params = {
        Bucket: bucket,
        Key: key
    };
    console.log(params);
    
    
       console.log('key---',key);
    var source = archiveobjBucket+'/'+key;
     console.log('source---',source);
    var destination = lensmediaBucket+'/'+key.substring(0, key.lastIndexOf("/")); 
     console.log('destination---',destination);
    var destKey = key.substring(key.lastIndexOf("/")+1, key.length);
     console.log('destKey---',destKey);
  //  copyObject(source,destination,destKey);
     var destinationOriginal = lensmediaBucket+'/'+key.substring(0, key.lastIndexOf("/")); 
     console.log('destinationOriginal---',destinationOriginal);
  //  copyObject(source,destinationOriginal,destKey)
  
  
   s3.copyObject({ 
       CopySource: source,
       Bucket: destination,
       Key: destKey,
       StorageClass : 'STANDARD'
       },function(copyErr, copyData){
          if (copyErr) {
               console.log("Error in copying object--",copyErr);
            } else {
               console.log('Object copied--'+destKey);
                var params = {
                          Bucket: archiveobjBucket, 
                          Key: key
                         };
               deleteObject(params);
            } 
       });
  
 
  
};

function deleteObject(params){
     s3.deleteObject(params, function(err, data) {
   if (err) {
   console.log(err, err.stack); // an error occurred
   console.log('Error in deleting object--',params.Key);
  } else  {
   console.log(data);           // successful response
   console.log('Object deleted--',params.Key);
      
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
