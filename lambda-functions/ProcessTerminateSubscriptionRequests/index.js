var aws = require('aws-sdk');
var http = require('http');
var lambda = new aws.Lambda({
    region: 'us-east-1'
});
var ses = new aws.SES();
var ssm = new aws.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var cognitoidentityserviceprovider = new aws.CognitoIdentityServiceProvider();
const TERMINATION_APPROVED = 7;
const TERMINATION_AUTO_APPROVED = 9;
const TERMINATION_IN_PROGRESS = 11;
exports.handler = (event, context) => {
    var envReq = getParameterFromSystemManager();
    envReq.then(() => {
        getTerminationRequests();
    })
    .catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};


async function getTerminationRequests() {

    console.log("calling getTerminationRequests");

    // return new Promise((resolve, reject) => {
    var data = [TERMINATION_APPROVED, TERMINATION_AUTO_APPROVED];
    const options = {
        // host: 'app.preprod.intelliocloud.com',
        host: environment['API_host'],
        port: environment['API_port'],
        path: '/subscription/termination/process',
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Actor': 'From ProcessTerminateSubscriptionRequests function',
            'lambda': '#1234lambd@_tr1gger4321#'
        }
    };


    const req = http.request(options, (res) => {
        console.log('status code--', res.statusCode);
        if (res.statusCode == 202) {
            console.log('Success in getting approved or Auto approved termination requests : ');
        } else {
            console.error('Error in getting approved or Auto approved termination requests: ');
        }
        res.setEncoding('utf8');
        var str = '';
        res.on('data', function (chunk) {
            str += chunk;
            console.log('Response: ' + str);

        });
        res.on('error', function (e) {
            console.log("Got error: " + e.message);

        });

        res.on('end', () => {
            console.log("data from db" + JSON.parse(str));
            var terminationRequests = JSON.parse(str);
            console.log('--terminationRequests--list-- ', terminationRequests);
            
            for (let j = 0; j < terminationRequests.length; j++) {
                var isProcessed = false;
                isProcessed = processTerminationRequest(terminationRequests[j]);
                isProcessed.then((result) => {
                    console.log('surgeonId---inside--isProcessed.then--', terminationRequests[j]['surgeon']);
                    var terminStatusUpdate = updateterminationStatus(terminationRequests[j]['surgeon']);
                    terminStatusUpdate.then((result) => {
                        console.log('--terminStatusUpdate---result', result);
                        disableCognitoUSer(terminationRequests[j]['surgeon']);
                    }, (error) => {
                        console.log('--terminStatusUpdate---error', error);
                        disableCognitoUSer(terminationRequests[j]['surgeon']);
                    });
                }, (error) => {
                    console.log('-isProcessed-then--err-', error);
                });
                // To send unlink notification
                sendUnlinkNotification(terminationRequests[j]['surgeon']);
            }

        });
    });

    // send the request
    req.write(JSON.stringify(data));
    req.end();

}

async function processTerminationRequest(terminationRequest) {
    console.log("calling processTerminationRequest");

    return new Promise((resolve, reject) => {
        lambda.invoke({
            FunctionName: environment['envprefix']+'_ProcessSubscriptionTerminationFunction',
            Payload: JSON.stringify(terminationRequest)
        }, function (err, data) {
            console.log('ProcessSubscriptionTermination Function call');
            if (err) {
                console.log('error in ProcessSubscriptionTermination : ' + err);
                reject(false);
            } else if (data) {
                console.log("ProcessSubscriptionTermination success");
                resolve(true);
            }
        });
    });
}

async function sendUnlinkNotification(surgeonUserId) {
    let lambdaPayload = {
        surgeonId : surgeonUserId,
        unlinkFrom : 'termination'
    };
    return new Promise((resolve, reject) => {
        lambda.invoke({
            FunctionName: environment['envprefix']+'_UnlinkNotifyOtherUsers',
            Payload: JSON.stringify(lambdaPayload)
        }, function (err, data) {
            console.log('UnlinkNotifyOtherUsers Function call');
            if (err) {
                console.log('error in UnlinkNotifyOtherUsers : ' + err);
                reject(false);
            } else if (data) {
                console.log("UnlinkNotifyOtherUsers success");
                resolve(true);
            }
        });
    });
}

async function updateterminationStatus(username) {
    console.log('Update status called..');
    return new Promise((resolve, reject) => {
        var res = '/subscription/status/' + TERMINATION_IN_PROGRESS;
        const options = {
            host: environment['API_host'],
            port: environment['API_port'],
            path: res,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Actor': username,
                'lambda': '#1234lambd@_tr1gger4321#'
            }
        };

        var bodyString = JSON.stringify({
            'Actor': username,

        });

        const req = http.request(options, (res) => {
            console.log('ststus code in update status--', res.statusCode);
            if (res.statusCode == 202) {
                console.log('Success in updating the status of subscription : ', username);
            } else {
                console.error('Error in updating the status of subscription: ', username);

            }
            res.setEncoding('utf8');
            var str = '';
            res.on('data', function (chunk) {
                str += chunk;
                console.log('Response: ' + str);

            });
            res.on('error', function (e) {
                console.log("Got error: " + e.message);
                reject(e);
            });

            res.on('end', () => {
                console.log("data from db" + JSON.parse(str));
                resolve(JSON.parse(str));

            });
        });

        // send the request
        req.write(bodyString);
        req.end();

    });

}

async function disableCognitoUSer(username) {
    return new Promise((resolve, reject) => {

        var params = {
            UserPoolId: environment['id_userpool'],
            Username: username
        };

        cognitoidentityserviceprovider.adminDisableUser(params, function (err, data) {

            if (err) {
                console.log('Error in updating disabling the user--', params.Username);
                console.log(err, err.stack); // an error occurred
                resolve(false);
            }
            else {
                console.log('Successfully disabled the user--', params.Username);
                console.log(data);
                resolve(true);// successful response
            }
        });
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