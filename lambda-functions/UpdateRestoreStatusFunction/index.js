var AWS = require('aws-sdk');
var http = require('http');
var s3 = new AWS.S3();
var user;
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var lensmediaBucket;

exports.handler = (event, context, callback) => {
    var envReq = getParameterFromSystemManager();
    envReq.then(() => {
        // TODO implement
        var path = '/patient/procedure/restore';
        const options = {
            host: environment['API_host'],
            port: environment['API_port'],
            path: path,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'lambda': '#1234lambd@_tr1gger4321#'
            }
        };
        lensmediaBucket = environment['envprefix'] + '-lensmediabucket';

        const req = http.request(options, (res) => {
            console.log('Web service called and response code--', res.statusCode);
            console.log('First GET call');
            if (res.statusCode == 200) {
                var str = '';
                res.on('data', function(chunk) {
                    str += chunk;
                });

                res.on('end', () => {
                    var response = JSON.parse(str);

                    console.log(response);
                    for (var i = 0; i < response.length; i++) {
                        updateRetoredStatus(response[i]['gpid'], response[i]['surgeonid']);
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
    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};


function updateRetoredStatus(gpid, surgeonid) {
    var flag = true;
    var path = '/patient/procedure/' + gpid;
    const options = {
        host: environment['API_host'],
        port: environment['API_port'],
        path: path,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Random token',
            'lambda': '#1234lambd@_tr1gger4321#',
            'surgeonid': surgeonid
        }
    };

    const req = http.request(options, (res) => {
        console.log('Web service called and response code--', res.statusCode);
        console.log('Second ');
        if (res.statusCode == 200) {
            var str = '';
            res.on('data', function(chunk) {
                str += chunk;
            });

            res.on('end', () => {
                var obj = JSON.parse(str);
                console.log('obj---', obj);
                for (var i in obj) {
                    if (i == 'procedureinfo') {
                        var newObj = obj[i];
                        for (var k in newObj) {
                            if (k == 'annotations') {
                                var glabalannotations = newObj[k];

                                glabalannotations.forEach((glabalannotationsitems, index) => {

                                    for (var key in glabalannotationsitems) {
                                        if (key == 'fileurl') {
                                            if (glabalannotationsitems[key] != undefined) {

                                                var params = {
                                                    Bucket: lensmediaBucket,
                                                    Key: glabalannotationsitems[key]
                                                };

                                                s3.headObject(params, function(err, metadata) {
                                                    if (err && err.code === 'NotFound') {
                                                        flag = false;

                                                    }
                                                });

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
                                                if (item1[key] != undefined) {
                                                    var params = {
                                                        Bucket: lensmediaBucket,
                                                        Key: item1[key]
                                                    };

                                                    s3.headObject(params, function(err, metadata) {
                                                        if (err && err.code === 'NotFound') {
                                                            flag = false;

                                                        }
                                                    });

                                                }
                                            }
                                            if (key == 'annotations') {

                                                var localAnnotations = item1[key];

                                                localAnnotations.forEach((localannotationsItem, index) => {
                                                    for (var key in localannotationsItem) {

                                                        if (key == 'fileurl') {
                                                            if (localannotationsItem[key] != undefined) {
                                                                var params = {
                                                                    Bucket: lensmediaBucket,
                                                                    Key: localannotationsItem[key]
                                                                };

                                                                s3.headObject(params, function(err, metadata) {
                                                                    if (err && err.code === 'NotFound') {
                                                                        flag = false;

                                                                    }
                                                                });
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

                if (flag) {
                    updateStatus(gpid, 'Restore Completed', surgeonid);
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
}


function updateStatus(gpid, status, surgeonid) {
    console.log('Update Status called--', gpid);


    var path = '/patient/procedure/archive/restore';

    var bodyString = JSON.stringify({
        'gpid': gpid,
        'procedurestatus': status,

    });

    var headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Random token',
        'lambda': '#1234lambd@_tr1gger4321#',
        'surgeonid': surgeonid
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