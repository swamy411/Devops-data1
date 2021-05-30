var AWS = require('aws-sdk');
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};
//var user;  

exports.handler = (event, context) => {

  var envReq = getParameterFromSystemManager();
    
  envReq.then(() => {

  // Set the region
  AWS.config.update({region: 'us-east-1'});

  // Create an SQS service object
  var sqs = new AWS.SQS({apiVersion: '2012-11-05'});
  const SQS_QUEUE_URL = environment['url_archivequeue'];

  var params = {
       MessageBody: JSON.stringify(event),
      QueueUrl: SQS_QUEUE_URL
  };

  console.log(`Sending notification via SQS: ${SQS_QUEUE_URL}.`);
  console.log(JSON.stringify(event));
      sqs.sendMessage(params, (err, data) => {
          if (err) {
            console.log("Error", err);
          } else {
            console.log("Successfully added message", data.MessageId);
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