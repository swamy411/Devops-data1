var aws = require('aws-sdk');
var cognitoidentityserviceprovider = new aws.CognitoIdentityServiceProvider(); 
var ssm = new aws.SSM();
var envPath = process.env.ssm_store;
var environment = {};

exports.handler = (event) => {
  var envReq = getParameterFromSystemManager();
  envReq.then(() => {
        // TODO implement
        var username = event['username'];

        var params = {
            UserPoolId: environment['id_userpool'], /* required */
            Username: username /* required */
        };

        cognitoidentityserviceprovider.adminDisableUser(params, function(err, data) {

        if (err)
          {
             console.log('Error in updating disabling the user--',params.Username);
             console.log(err, err.stack); // an error occurred
           }
         else {
             console.log('Successfully disabled the user--',params.Username);
             console.log(data);           // successful response
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