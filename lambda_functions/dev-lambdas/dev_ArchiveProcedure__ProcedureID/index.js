var jwt = require('jsonwebtoken');
var request = require('request');
var jwkToPem = require('jwk-to-pem');
const AuthPolicy = require('aws-auth-policy');
var AWS = require('aws-sdk');
var pems, iss;

exports.handler = (event, context, callback) => {
  iss = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_cWMNjCSVb'
  // TODO implement
  if (!pems) {
    // Download the JWKs and save it as PEM
    request({
      url: iss + '/.well-known/jwks.json',
      json: true
    }, function (error, response, body) {
      // console.log('## error ', error, ' ## res ', response, ' #body ',body);
      if (!error && response.statusCode === 200) {
        pems = {};
        var keys = body['keys'];
        for (var i = 0; i < keys.length; i++) {
          // Convert each key to PEM
          var key_id = keys[i].kid;
          var modulus = keys[i].n;
          var exponent = keys[i].e;
          var key_type = keys[i].kty;
          var jwk = {
            kty: key_type,
            n: modulus,
            e: exponent
          };
          var pem = jwkToPem(jwk);
          pems[key_id] = pem;
        }
        //Now continue with validating the token
        validateToken(pems, event, context);
      } else {
        //Unable to download JWKs, fail the call
        context.fail("error");
      }
    });
  } else {
    console.log('Else PEM');
    //PEMs are already downloaded, continue with validating the token
    validateToken(pems, event, context);
  };
};

function validateToken(pems, event, context) {
  console.log('## Event ', event);
  var contextPath = event.requestContext['stage'];
  var token = event.headers['Authorization'];
  //Fail if the token is not jwt
  console.log('@@ token ', token);
  var decodedJwt = jwt.decode(token, {
    complete: true
  });
  console.log('## dec tok ', decodedJwt);
  if (!decodedJwt) {
    console.log("Not a valid JWT token");
    context.fail("Unauthorized");
    return;
  }
  //Fail if token is not from your User Pool
  if (decodedJwt.payload.iss != iss) {
    console.log("invalid issuer");
    context.fail("Unauthorized");
    return;
  }
  console.log('## context path ', contextPath);
  //Reject the jwt if it's not an 'Access Token'
  if (decodedJwt.payload.token_use != 'access' && contextPath != 'v1') {
    console.log("Not an access token");
    context.fail("Unauthorized");
    return;
  }

  //Get the kid from the token and retrieve corresponding PEM
  var kid = decodedJwt.header.kid;
  var pem = pems[kid];
  if (!pem) {
    console.log('Invalid token ', pem);
    context.fail("Unauthorized");
    return;
  }
  
 

  //Verify the signature of the JWT token to ensure it's really coming from your User Pool

  jwt.verify(token, pem, {
    issuer: iss
  },  (err, payload)=> {
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
      if(contextPath == 'v1') {
        context.succeed(policy.build());// successful response
        return;
      }
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
