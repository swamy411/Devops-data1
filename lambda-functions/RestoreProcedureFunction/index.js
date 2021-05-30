var AWS = require('aws-sdk');
var http = require('http');
var s3 = new AWS.S3();
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};

exports.handler = (event, context, callback) => {
    var gpid = event['gpid'];
    var tokenId = event['tokenid'];
    var surgeonname = event['surgeonname'];
    var ownerId = event['ownerId'];
    if (event['username']) {
        surgeonname = event['username'];
    }
    console.log('gpid--surgeonname-', gpid, surgeonname, event);
    var envReq = getParameterFromSystemManager();
    envReq.then(() => {
        for (var i = 0; i < gpid.length; i++) {
            updateStatus(gpid[i], 'Restore In Progress', tokenId, ownerId);
            restoreProceduer(gpid[i], tokenId, surgeonname, ownerId);
        }

        callback(null, 'pass');
    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};


function restoreObject(key, tier) {

    var params = {
        Bucket: environment['envprefix'] + '-patientprocedure-archive',
        Key: key,
        RestoreRequest: {
            Days: 1,
            GlacierJobParameters: {
                Tier: tier
            }
        }
    };

    s3.restoreObject(params, (err, data) => {
        if (err) {
            if (err.statusCode === 503 && err.retryable === true) {
                restoreObject(params.Key, 'Standard');
            }
            console.log("error in restoration");
            console.log("-if error--params------", params.Key, params);
            console.log(err, err.stack); // an error occurred
        }
        else {
            console.log("Restore completed");
            console.log(data);
        }
    });
}


function restoreProceduer(gpid, tokenId, surgeonname, ownerId) {
    var header;
    if (surgeonname) {
        header = {
            'Content-Type': 'application/json',
            'Authorization': tokenId,
            'lambda': '#1234lambd@_tr1gger4321#',
            'surgeonid': surgeonname
        };
    } else {
        header = {
            'Content-Type': 'application/json',
            'Authorization': tokenId
        };
    }
    if (ownerId) {
        header['ownerid'] = ownerId;
    }
    var path = '/patient/procedure/' + gpid;
    const options = {
        host: environment['API_host'],
        port: environment['API_port'],
        path: path,
        method: 'GET',
        headers: header
    };
    console.log('/patient/procedure/gpid--options--', options);
    const req = http.request(options, (res) => {
        console.log('Web service called and response code--', res.statusCode);
        if (res.statusCode == 200) {
            var str = '';
            res.on('data', function (chunk) {
                str += chunk;
            });

            res.on('end', () => {
                var obj = JSON.parse(str);
                console.log(obj);
                for (var i in obj) {
                    if (i == 'procedureinfo') {
                        var newObj = obj[i];
                        for (var k in newObj) {
                            if (k == 'annotations') {
                                var glabalannotations = newObj[k];

                                glabalannotations.forEach((glabalannotationsitems, index) => {

                                    for (var key in glabalannotationsitems) {
                                        if (key == 'fileurl') {
                                            if (glabalannotationsitems[key]) {
                                                console.log('globalannotations path--', glabalannotationsitems[key]);
                                                restoreObject(glabalannotationsitems[key], 'Expedited');

                                            }
                                        }
                                    }

                                });

                            }

                        }
                    }

                    if (i == 'camerasettings') {
                        var camerasettings = obj[i];

                        camerasettings.forEach((item, index) => {
                            for (var key in item) {
                                if (key == 'media') {

                                    var media = item[key];
                                    media.forEach((item1, index) => {
                                        for (var key in item1) {

                                            if (key == 'fileurl') {
                                                if (item1[key]) {
                                                    console.log('Media path--', item1[key]);
                                                    restoreObject(item1[key], 'Expedited');


                                                }
                                            }
                                            if (key == 'annotations') {

                                                var localAnnotations = item1[key];

                                                localAnnotations.forEach((localannotationsItem, index) => {
                                                    for (var key in localannotationsItem) {

                                                        if (key == 'fileurl') {
                                                            if (localannotationsItem[key]) {
                                                                console.log('local annotations path--', localannotationsItem[key]);
                                                                restoreObject(localannotationsItem[key], 'Expedited');


                                                            }
                                                        }
                                                    }
                                                });

                                            }
                                        }

                                    });

                                }


                            }

                        });

                    }


                }

                updateStatus(gpid, 'Restore in Progress', tokenId, surgeonname, ownerId);


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

}


function updateStatus(gpid, status, tokenId, surgeonname, ownerId) {

    var path = '/patient/procedure/archive/restore';

    var bodyString = JSON.stringify({
        'gpid': gpid,
        'procedurestatus': status,
        'surgeonname': surgeonname
    });

    console.log('gpid--', gpid);
    console.log('status--', status);
    console.log('tokenId--', tokenId);
    var header;
    if (surgeonname) {
        header = {
            'Content-Type': 'application/json',
            'Content-Length': bodyString.length,
            'Authorization': tokenId,
            'lambda': '#1234lambd@_tr1gger4321#',
            'surgeonid': surgeonname
        };
    } else {
        header = {
            'Content-Type': 'application/json',
            'Authorization': tokenId,
            'Content-Length': bodyString.length,
            'surgeonid': 'Lambda call'
        };
    }
    if (ownerId) {
        header['ownerid'] = ownerId;
    }
    const options = {
        host: environment['API_host'],
        port: environment['API_port'],
        path: path,
        method: 'PUT',
        headers: header
    };
    console.log('/patient/procedure/archive/restore--options--', options);

    const req = http.request(options, (res) => {

        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            console.log('Response: ' + chunk);

        });
        res.on('error', function (e) {
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