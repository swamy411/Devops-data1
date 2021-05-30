var AWS = require('aws-sdk');
var http = require('http');
var s3 = new AWS.S3();
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};

exports.handler = (event, context, callback) => {
    var envReq = getParameterFromSystemManager();
    envReq.then(() => {
        var gpid = event['gpid'];
        var tokenId = event['tokenid'];
        var userName = event['username'];

        // To updated procedure status to deletiong in Progress 
        updateProcedureObjectsDeleteStatus(gpid, 3);

        getDeletedObjects(gpid, userName, tokenId);

        callback(null, 'pass');
    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};


function getDeletedObjects(gpid, userName, tokenId) {
    var recoverystatus = true;
    var path = '/patient/procedure/deletedobjectrecords/' + gpid;
    const options = {
        host: environment['API_host'],
        port: environment['API_port'],
        path: path,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': tokenId
        }
    };
    const req = http.request(options, (res) => {
        console.log('Web service called and response code--', res.statusCode);

        if (res.statusCode == 200) {
            var str = '';
            res.on('data', function(chunk) {
                str += chunk;
            });

            res.on('end', () => {
                console.log('str--', str);
                var obj = JSON.parse(str);
                console.log('obj---', obj);
                for (var i in obj) {
                    if (i == 'globalannotations') {
                        var global = obj[i];
                        console.log('inside global---', obj[i]);
                        for (var i = 0; i < global.length; i++) {
                            var globalId = global[i][0];
                            var globalKey = global[i][1];
                            if (globalKey != undefined)
                                restoreObject(globalKey, gpid, userName, null, globalId, null, tokenId);
                        }
                    }
                    if (i == 'medias') {
                        console.log('inside media---', obj[i]);
                        var media = obj[i];
                        for (var i = 0; i < media.length; i++) {
                            var mediaId = media[i][0];
                            var mediaKey = media[i][1];
                            if (mediaKey != undefined)
                                restoreObject(mediaKey, gpid, userName, null, null, mediaId, tokenId);

                        }
                    }
                    if (i == 'localannotations') {

                        var local = obj[i];

                        for (var i = 0; i < local.length; i++) {
                            var localId = local[i][0];
                            var localKey = local[i][1];
                            if (localKey != undefined)
                                restoreObject(localKey, gpid, userName, localId, null, null, tokenId);

                        }

                    }
                }

            });


        } else {
            console.log('Error from web service' + res.statusCode);
        }
    });

    req.on('error', (e) => {
        console.log('Error Message: ' + e.message);
    });

    console.log('End Data call');
    req.end();
    return recoverystatus;

}

function updateObjectRecoveryStatus(gpid, userName, localannotationid, globalannotationsid, mediaid, tokenId) {
    const options = {
        host: environment['API_host'],
        port: environment['API_port'],
        path: '/patient/procedure/object/recover',
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': tokenId
        }
    };

    var bodyString = JSON.stringify({
        'gpid': gpid,
        'userName': userName,
        'localannotationid': localannotationid,
        'globalannotationsid': globalannotationsid,
        'mediaid': mediaid,
    });

    console.log('bodyString----', bodyString);

    const req = http.request(options, (res) => {
        console.log('ststus code--', res.statusCode);
        if (res.statusCode == 202) {
            console.log('Success in updating recover status of the object : ');
        } else {
            console.error('Error in updating recover status of the object: ');
        }
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
            console.log('Response: ' + chunk);

        });
        res.on('error', function(e) {
            console.log("Got error: " + e.message);

        });
    });

    // send the request
    req.write(bodyString);
    req.end();

}


function restoreObject(key, gpid, userName, localannotationid, globalannotationsid, mediaid, tokenId) {
    var params = {
        Bucket: environment['envprefix'] + '-lensarchiveobjects',
        Key: key,
        RestoreRequest: {
            Days: 1,
            GlacierJobParameters: {
                Tier: "Expedited"
            }
        }
    };
    s3.restoreObject(params, function(err, data) {
        if (err)
            console.log('Error in restoring deleted object--', params.Key, err); // an error occurred
        else {
            console.log('Object restored--', params.Key);
            updateObjectRecoveryStatus(gpid, userName, localannotationid, globalannotationsid, mediaid, tokenId);

        }
    });
}


function updateProcedureObjectsDeleteStatus(gpid, status) {
    console.log('Update Status called--', gpid);
    var path = '/patient/procedure/delete/recover';

    var bodyString = JSON.stringify({
        'gpid': gpid,
        'status': status,

    });

    var headers = {
        'Content-Type': 'application/json',
        'Content-Length': bodyString.length,
        'lambda': '#1234lambd@_tr1gger4321#'

    };

    const options = {
        host: environment['API_host'],
        port: environment['API_port'],
        path: path,
        method: 'PUT',
        headers: headers
    };


    const req = http.request(options, (res) => {

        res.setEncoding('utf8');
        res.on('data', function(chunk) {
            console.log('Response: ' + chunk);

        });
        res.on('error', function(e) {
            console.log("Got error: " + e.message);

        });
    });

    // send the request
    req.write(bodyString);
    req.end();


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