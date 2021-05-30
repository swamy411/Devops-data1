var AWS = require('aws-sdk');
var fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var s3 ;
var srcBucket = "";
var destBucket = "=";
 
 
 
 exports.handler = (event, context, callback) => { 
  var envReq = getParameterFromSystemManager();
  envReq.then(() => {
    AWS.config.update({ region: 'us-east-1'});
    s3 = new AWS.S3({apiVersion: '2006-03-01'});
    srcBucket = environment['envprefix'] + '-lensmediabucket';
    destBucket = environment['envprefix'] + '-exportprocedurebucket';
    var foldername = 'TowerDeviceData'+event['foldername'];
    var devicepaths = event['blobpaths'];
    console.log('foldername---',foldername);
    const csvWriter = createCsvWriter({
        path: '/tmp/Towerdevicedata.csv',
        header: [
            {id: 'surgeonname',   title: 'Surgeon name'},
            {id: 'proceduredate',  title: 'procedure date'},
            {id: 'proceduretype', title: 'procedure type'},
            {id: 'uploadeddate', title: 'upload date'},
            {id: 'deviceblobid',  title: 'device blob id'}
        ]
    });
    const records = event['deviceblob'];
    console.log(records);
    csvWriter.writeRecords(records)       // returns a promise
      .then(() => {
          console.log('...Done');
          var param = {
              Bucket: destBucket,
              Key: foldername+'/'+'Towerdevicedata.csv',
              Body: fs.createReadStream('/tmp/Towerdevicedata.csv')
          };  
          putObject(param);
      });
      
      console.log('paths----',devicepaths);
      devicepaths.forEach(function(docPath){
      var source = srcBucket+'/'+docPath;
      console.log('source---',source);
      var destination = destBucket+'/'+foldername;
      console.log('destination--',destination);
      console.log('Key---',getKey(docPath));
      copyObject(source,destination,getKey(docPath));
      });
      
      
    //  createZip(zipparams);
    
    callback(null,foldername);
  }).catch((err) => {
    console.log('GetSSMParam-error', err);
  });
 };    
 function putObject(param){
     s3.putObject(param, function(err, data){
      if(err)
       console.log(err);
        else
          console.log(data);
       });
    }
    
 function copyObject(source,destination,destKey){
      s3.copyObject({ 
       CopySource: source,
       Bucket: destination,
       Key: destKey,
       Tagging: "DeleteTag=Delete"
       },function(copyErr, copyData){
          if (copyErr) {
               console.log("Error in copying images--",source);
            } else {
               console.log('Copied images--'+destKey);
          
            } 
       });
     
 
 }   
    
  function getKey(path){
    var lastSpecialPosition = path.lastIndexOf("-");
   return path.substring(lastSpecialPosition+1, path.length);
   
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