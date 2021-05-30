var aws = require('aws-sdk');
var http = require('http');
var ssm = new aws.SSM();
var envPath = process.env.ssm_store;
var environment = {};

exports.handler = (event, context, callback) => {
    var envReq = getParameterFromSystemManager();
    envReq.then(() => {
        const options = {
            host: environment['API_host'],
            port: environment['API_port'],
            path: '/subscription/autoRefresh',
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Actor':'From SubscriptionSyncronization function',
                'lambda': '#1234lambd@_tr1gger4321#'
            }
        };

        const req = http.request(options, (res) => {
            var str;
             console.log('Web service called and response code--', res.statusCode);
              res.on('data', function(chunk) {
                   str += chunk;
                   console.log(str);
               });
           
               // the whole response has been recieved, so we just print it out here
               res.on('end', function() {
                   console.log('response ', str);
               });
       });
        
        
        req.on('error', (e) => {
            console.log('Error Message: ' + e.message);
        });
    
        console.log('End call');
        req.end();
        
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