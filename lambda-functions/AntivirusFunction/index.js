var AWS = require('aws-sdk');
var sqs = new AWS.SQS({region : 'us-east-1'});
AWS.config.update({region:'us-east-1'});
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};

exports.handler = function(event, context) {

  var envReq = getParameterFromSystemManager();
  envReq.then(() => {
    var params = {
      MessageBody: JSON.stringify(event),
      QueueUrl: environment['url_scanqueue']
    }; 
      
    sqs.sendMessage(params, function(err,data){
      if(err) {
        console.log('error:',"Fail Sending Message to SQS" + err);
        context.done('error', "ERROR Put SQS");  // ERROR with message
      }else{
        console.log('Success call to SQS:',data.MessageId);
        context.done(null,'');  // SUCCESS 
      
        
      }
    });
  }).catch((err) => {
      console.log('GetSSMParam-error', err);
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