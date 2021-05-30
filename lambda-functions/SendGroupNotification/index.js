var aws = require('aws-sdk');
var lambda = new aws.Lambda({
    region: 'us-east-1'
});
var http = require('http');
var ssm = new aws.SSM();
var envPath = process.env.ssm_store;
var environment = {};


exports.handler = (event, context, callback) => {
    var envReq = getParameterFromSystemManager();
    envReq.then( () => {

        var usersListPromise =  new Promise((resolve, reject) => {
            const options = {
                host: environment['API_host'],
                port: environment['API_port'],
                path: '/users?pageno=1&size=0',
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'lambda': '#1234lambd@_tr1gger4321#',
                    'authorization': 'random token'
                }
            };
            const req = http.request(options, (res) => {
                if (res.statusCode != 200) {
                    console.log(`Error getting users list status code:  ${res.statusCode}`);
                    reject(false);
                } else {
                    var str = '';
                    res.on('data', function (chunk) {
                        str += chunk;
                    });

                    res.on('end', () => {
                        var result = JSON.parse(str);
                        console.log('----getUsers-API-res--timeStamp--', Date.now(), result);
                        resolve(result);
                    });

                }
            });
            req.on('error', (e) => {
                console.log(`Error getting users list :  ${e.message}`);
                reject(false);
            });
            req.end();
        });

        const notifyModes = [{ type: 'email',
                              childLambda: '_EmailGroupNotification' },
                             { type: 'sms',
                              childLambda: '_SMSGroupNotification' },
                             { type: 'cloud',
                              childLambda: '_CloudGroupNotification' }];
        /* To call child notification lambda if any pending notifications */
        notifyModes.map((eachMode) =>  {
            getPendingNotifications(eachMode.type, (err, res) => {
                if (err) {
                    console.log(`----err-----${eachMode.type}---${err}`);
                } else {
                    console.log(`----res----${eachMode.type}---${JSON.stringify(res)}`);
                    if(res.length > 0) {
                        let childLambdaPayload = {
                            notificationList : res
                        };
                        usersListPromise.then((userList) => {
                            childLambdaPayload['userlist'] = userList;
                            console.log('----start calling child lambda----', eachMode.type);
                            callChildLambda(eachMode.childLambda,  childLambdaPayload);
                        }).catch((err) => {
                            console.log('----err--userList-promise---', err);
                        });
                    }
                }
            });
        });

    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};

/* Function to call Pending communication API */
function getPendingNotifications(mode, callback) {
    const options = {
        host: environment['API_host'],
        port: environment['API_port'],
        path: '/communication/'+ mode,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'lambda': '#1234lambd@_tr1gger4321#'
        }
    };
    const req = http.request(options, (res) => {
        if (res.statusCode != 200) {
            console.log(`Error getting ${mode} notification list status code:  ${res.statusCode}`);
            return callback(res, null);
        } else {
            var str = '';
            res.on('data', function (chunk) {
                str += chunk;
            });

            res.on('end', () => {
                var result = JSON.parse(str);
                return callback(null, result);
            });
        }
    });

    req.on('error', (e) => {
        console.log(`Error getting ${mode} notification list :  ${e.message}`);
        return callback(e, null);
    });
    req.end();
}

/* Function to invoke child lambdas */
function callChildLambda(lambdaName, payloadJson) {
    lambda.invoke({
        FunctionName: environment['envprefix']+lambdaName,
        Payload: JSON.stringify(payloadJson)
    }, function (err, data) {
        if (err) {
            console.log('error invoking child lambda : ' + lambdaName + ' Error: '+ err);
        } else if (data) {
            console.log("invoking child lambda success : " + lambdaName);
        }
    });
}

/* Function to get SSM parameters */
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