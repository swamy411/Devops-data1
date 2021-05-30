var jwt = require('jsonwebtoken');
const axios = require('axios');
var jwkToPem = require('jwk-to-pem');
const AuthPolicy = require('aws-auth-policy');
var AWS = require('aws-sdk');
const JWTDecode =  require('jwt-decode');
var pems, iss;

exports.handler = (event, context, callback) => {
  console.log('Method ARN ',event.methodArn);
  process.env['JWT_SECRET'] = 'e177920e88165bd0090b1c6b544cf7';
  const secret = Buffer.from(process.env.JWT_SECRET, "base64");
  console.log('secret ',secret, ' JWT ')
  iss = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_cWMNjCSVb';
  const token = event.headers['authorization'];
      const methodArn = event.methodArn;

      if (!token || !methodArn) return callback(null, "Unauthorized");
      var decoded = JWTDecode(token);

      // const secret = Buffer.from(process.env.JWT_SECRET, "base64");
      return callback(null, generateAuthResponse(decoded.id, "Allow", methodArn));
      // verifies token
      // const decoded = jwt.verify(token, secret);

      // if (decoded && decoded.id) {
      //   return callback(null, generateAuthResponse(decoded.id, "Allow", methodArn));
      // } else {
      //   return callback(null, generateAuthResponse(decoded.id, "Deny", methodArn));
      // }
  // TODO implement
  // if (!pems) {
  //   //Download the JWKs and save it as PEM
  //   console.log('### inside pems');
  //   let url = iss + '/.well-known/jwks.json';
  //   axios.get('https://google.com')
  //   .then(function (response) {
  //     // handle success
  //     console.log(response);
  //     let obj = response;
  //     pems = {};
  //     var keys = obj['keys'];
  //     for (var i = 0; i < keys.length; i++) {
  //     //Convert each key to PEM
  //     var key_id = keys[i].kid;
  //     var modulus = keys[i].n;
  //     var exponent = keys[i].e;
  //     var key_type = keys[i].kty;
  //     var jwk = {
  //         kty: key_type,
  //         n: modulus,
  //         e: exponent
  //     };
  //     var pem = jwkToPem(jwk);
  //     pems[key_id] = pem;
  //     }
  //     //Now continue with validating the token
  //     validateToken(pems, event, context);
  //   })
  //   .catch(function (error) {
  //     console.log('## Error ', error);
  //     //Unable to download JWKs, fail the call
  //     context.fail("error");
  //   })
  //   .then(function () {
  //     // always executed
  //     console.log('Axios then executed');
  //   });
    
  // } else {
  //   console.log('Else PEM');
  //   //PEMs are already downloaded, continue with validating the token
  //   validateToken(pems, event, context);
  // };
};

function generateAuthResponse(principalId, effect, methodArn) {
      const policyDocument = generatePolicyDocument(effect, methodArn);

      return {
        principalId,
        policyDocument
      };
    }

    function generatePolicyDocument(effect, methodArn) {
      if (!effect || !methodArn) return null;

      const policyDocument = {
        Version: "2012-10-17",
        Statement: [
          {
            Action: "execute-api:Invoke",
            Effect: effect,
            Resource: methodArn
          }
        ]
      };

      return policyDocument;
    }

function validateToken(pems, event, context) {
  console.log('## Event ', event);
  var token = event.headers['authorization'];
  //Fail if the token is not jwt
  var decodedJwt = jwt.decode(token, {
    complete: true
  });
  if (!decodedJwt) {
    console.log("Not a valid JWT token");
    context.fail("Unauthorized");
    return;
  }
  console.log('## dec tok ', decodedJwt);
  //Fail if token is not from your User Pool
  if (decodedJwt.payload.iss != iss) {
    console.log("invalid issuer");
    context.fail("Unauthorized");
    return;
  }

  //Reject the jwt if it's not an 'Access Token'
  if (decodedJwt.payload.token_use != 'access') {
    console.log("Not an access token");
    context.fail("Unauthorized");
    return;
  }

  //Get the kid from the token and retrieve corresponding PEM
  var kid = decodedJwt.header.kid;
  var pem = pems[kid];
  if (!pem) {
    console.log('Invalid access token');
    context.fail("Unauthorized");
    return;
  }
  
 

  //Verify the signature of the JWT token to ensure it's really coming from your User Pool

  jwt.verify(token, pem, {
    issuer: iss
  }, function (err, payload) {
    if (err) {
      context.fail("Unauthorized");
    } else {
      //Valid token. Generate the API Gateway policy for the user
      //Always generate the policy on value of 'sub' claim and not for 'username' because username is reassignable
      //sub is UUID for a user which is never reassigned to another user.

      var principalId = payload.sub;

      //Get AWS AccountId and API Options
      var apiOptions = {};
      var tmp = event.methodArn.split(':');
      var apiGatewayArnTmp = tmp[5].split('/');
      var awsAccountId = tmp[4];
      apiOptions.region = tmp[3];
      apiOptions.restApiId = apiGatewayArnTmp[0];
      apiOptions.stage = apiGatewayArnTmp[1];
      var method = apiGatewayArnTmp[2];
      var resource = '/'; // root resource
      if (apiGatewayArnTmp[3]) {
        resource += apiGatewayArnTmp[3];
      }

      //For more information on specifics of generating policy, see the blueprint for the API Gateway custom
      //authorizer in the Lambda console
      console.log('## pr acc api',principalId,' ## ',awsAccountId, ' ## ',apiOptions);
      var policy = new AuthPolicy(principalId, awsAccountId, apiOptions);
      policy.allowAllMethods();
      var cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider({
            region: AWS.config.region
        });
        var cognitoAuthTokenParams = {
          AccessToken: token,
          DeviceKey: "string"
        };
        const deviceKey = payload.device_key;
        var params = {
          AccessToken: token,
          DeviceKey: deviceKey
        };
        context.succeed(policy.build());// successful response TODO: need to remove
        cognitoidentityserviceprovider.getDevice(params, (deviceErr, deviceData) => {
          if (deviceErr) {
            console.log('list device error ', deviceErr, deviceErr.stack); // an error occurred
            context.fail("Unauthorized"); // an error occurred
            return;
          }
          else {
            console.log('list device data ',deviceData);  
            console.log("Session not revoked", deviceData.Device, deviceData.Device.length); // successful response
            const devices = deviceData.Device;
            
              var deviceAttributes = devices.DeviceAttributes;
              for (var j = 0; j< deviceAttributes.length; j++) {
                console.log('Device Attributes ', deviceAttributes[j])
              }
            
            if (devices.hasOwnProperty('DeviceKey')) {
              context.succeed(policy.build());// successful response
            } else {
              console.log('list device error ', deviceErr, deviceErr.stack); // an error occurred
              context.fail("Unauthorized"); // an error occurred
              return;
            }
          }
        });
        
         
        // cognitoidentityserviceprovider.getUser(cognitoAuthTokenParams, (err, data) => {
        //   if (err) {
        //     console.log(err);
        //     context.fail("Unauthorized"); // an error occurred
        //     return;
        //   }
        //   else {
        // //     cognitoidentityserviceprovider.listDevices(params, (deviceErr, deviceData) => {
        // //   if (deviceErr) {
        // //     console.log('list device error ', deviceErr, deviceErr.stack); // an error occurred
        // //   }
        // //   else {
        // //     console.log('list device data ',deviceData);  
        // //     console.log("Session not revoked"); // successful response
            
        // //     context.succeed(policy.build());// successful response
        // //   }
        // // });
        //   // console.log('get user ',data);
        //   console.log("Session not revoked"); // successful response
            
        //     context.succeed(policy.build());// successful response
        //   }
        // });

      // context.succeed(policy.build());
    }
  });
};
