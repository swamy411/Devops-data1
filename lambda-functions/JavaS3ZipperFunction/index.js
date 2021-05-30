var aws = require('aws-sdk');
var http = require('http');
var cognitoidentityserviceprovider;
var ssm = new aws.SSM();
var envPath = process.env.ssm_store;
var environment = {};

exports.handler = (event, context, callback) => {
  console.log('inside handler');
  var envReq = getParameterFromSystemManager();
  envReq.then(() => {
    // console.log(event);
    // var passwordzip = undefined;
    // console.log('AWS object ', aws);
    // cognitoidentityserviceprovider = new aws.CognitoIdentityServiceProvider();
    // console.log(cognitoidentityserviceprovider);
    // let userName = event.surgeonname;
    // const params = {
    //   UserPoolId: environment['id_userpool'],
    //   Username: userName
    // };
    // const exportType = event['exporttype'] ? event['exporttype'] : 'procedure';
    // cognitoidentityserviceprovider.adminGetUser(params, (errDetail, dataDetail) => {
    //   if (errDetail) {
    //     console.log('Error Detail');
    //     console.log(errDetail);
    //     callback(Error('s3zipper'));
    //     // context.done(null, 'Error');
    //   } else {
    //     console.log('Data Detail');
    //     console.log(dataDetail);
    //     let attributes = undefined, phone_number, preferred_username;

    //     if (dataDetail.hasOwnProperty('UserAttributes')) {
    //       attributes = dataDetail.UserAttributes;

    //       phone_number = attributes.filter((attribute) => {
    //         return attribute.Name === 'phone_number';
    //       });

    //       preferred_username = attributes.filter((attribute) => {
    //         return attribute.Name === 'preferred_username';
    //       });
    //     }
    //     phone_number = phone_number.length ? phone_number[0]['Value'] : '';
    //     preferred_username = preferred_username.length ? preferred_username[0]['Value'] : '';
    //     let last5Phone = phone_number.substr(phone_number.length - 5);
    //     console.log(' Username ', userName, ' preferred username ', preferred_username, ' phone number ', phone_number, ' last 5 digit ', phone_number.substr(phone_number.length - 5));
    //     passwordzip = `${preferred_username}${last5Phone}`;
    //     var bucket = environment['envprefix'] + '-exportprocedurebucket';
    //     var foldername = event['mrnnumber'];
    //     var emailid = event['emailid'];

    //     console.log('password = ', passwordzip);
    //     console.log('mrnnumber = ', foldername);
    //     console.log('emailid = ', emailid);


    //     createZip(bucket, foldername, passwordzip, emailid, callback, exportType);

    //     console.log('Zipper Completed');
    //   }
    // });
    callback(null, 'pass');
  }).catch((err) => {
    console.log('GetSSMParam-error', err);
  });
};


// function createZip(bucket, folder, password, emailid, callback, exportType) {
//   const options = {
//     host: environment['API_host'],
//     port: environment['API_port'],
//     path: '/zipper',
//     method: 'PUT',
//     headers: {
//       'Content-Type': 'application/json',
//       'lambda': '#1234lambd@_tr1gger4321#'
//     }
//   };

//   var bodyString = JSON.stringify({
//     'bucket': bucket,
//     'remoteFolder': folder,
//     'zipPassword': password,
//     'emailID': emailid,
//     'exporttype': exportType
//   });

//   const req = http.request(options, (res) => {
//     console.log('res.statusCode----', res.statusCode);
//     if (res.statusCode == 202) {
//       console.log('Success in creating zip file: ');
//       callback(null, 'Passed');
//     } else {
//       console.error('Error in creating zip file: ');
//       callback('Failed', null);
//     }
//     res.on('data', (d) => {
//       process.stdout.write(d);
//     });
//   });

//   req.on('error', (error) => {
//     console.error(error);
//   });
//   req.useChunkedEncodingByDefault = true;
//   console.log('bodyString----', bodyString);
//   req.write(bodyString);
//   req.end();
// }

 const getParameterFromSystemManager = () => {
  console.log('inside getparameter');
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
exports.getParameterFromSystemManager = getParameterFromSystemManager;