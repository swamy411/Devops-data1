var aws = require('aws-sdk');
var http = require('http');
var s3 = new aws.S3();
var ssm = new aws.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var lensmediaBucket;
var procedureArchiveBucket;

exports.handler = async (event, context) => {

    var envReq = getParameterFromSystemManager();
    envReq.then(() => {
        var gpid = event["gpid"];
        var surgeon = event["surgeon"];
        var procedureDataLocations = null;
        lensmediaBucket = environment['envprefix'] + '-lensmediabucket';
        procedureArchiveBucket = environment['envprefix'] + '-patientprocedure-archive';

        var isResponse = await new Promise((resolve, reject) => {

            const options = {
                host: environment['API_host'],
                port: environment['API_port'],
                path: "/subscription/procedure/" + gpid,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Actor': surgeon,
                    'lambda': '#1234lambd@_tr1gger4321#'
                }
            };

            const req = http.request(options, (res) => {
                console.log('Web service called and response code--', res.statusCode);
                if (res.statusCode == 200) {
                    var str = '';
                    res.on('data', function (chunk) {
                        str += chunk;
                    });

                    res.on('end', () => {
                        procedureDataLocations = JSON.parse(str);
                    });
                    console.log('success in calling web service - ' + res.statusCode);
                    resolve(true);
                } else {
                    console.log('Error from web service - ' + res.statusCode);
                    reject(false);
                }
            });

            req.on('error', (e) => {
                console.log('Error Message: ' + e.message);
                reject(false);
            });

            console.log('End Data call');
            req.end();
        });

        if (!isResponse) {
            return;
        }

        for (var i in procedureDataLocations) {
            if (i == 'procedureinfo') {
                var newObj = procedureDataLocations[i];
                for (var k in newObj) {
                    if (k == 'annotations') {
                        var glabalannotations = newObj[k];

                        glabalannotations.forEach((glabalannotationsitems, index) => {

                            for (var key in glabalannotationsitems) {
                                if (key == 'fileurl') {
                                    if (glabalannotationsitems[key] != undefined) {
                                        var innerpath = glabalannotationsitems[key];
                                        deleteObject(lensmediaBucket, innerpath);
                                        deleteObject(procedureArchiveBucket, innerpath);
                                    }
                                }
                            }

                        });

                    }

                }
            }

            if (i == 'camerasettings') {
                var camerasettings = procedureDataLocations[i];

                camerasettings.forEach((item, index) => {
                    for (var key in item) {
                        if (key == 'media') {

                            var media = item[key];
                            media.forEach((item1, index) => {
                                for (var key in item1) {

                                    if (key == 'fileurl') {
                                        if (item1[key] != undefined) {
                                            var innerpath = item1[key];

                                            deleteObject(lensmediaBucket, getImageThumbnailPath(innerpath));
                                            deleteObject(lensmediaBucket, getVideoThumbnailPath(innerpath));

                                            deleteObject(lensmediaBucket, innerpath);
                                            deleteObject(procedureArchiveBucket, innerpath);
                                        }
                                    }
                                    if (key == 'annotations') {

                                        var localAnnotations = item1[key];

                                        localAnnotations.forEach((localannotationsItem, index) => {
                                            for (var key in localannotationsItem) {

                                                if (key == 'fileurl') {
                                                    if (localannotationsItem[key] != undefined) {
                                                        var innerpath = localannotationsItem[key];
                                                        deleteObject(lensmediaBucket, innerpath);
                                                        deleteObject(procedureArchiveBucket, innerpath);
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
    });
};



function getImageThumbnailPath(objectPath) {
    var lastSpecialPosition = objectPath.lastIndexOf("/");
    return objectPath.substring(0, lastSpecialPosition) + '/Thumb_' + objectPath.substring(lastSpecialPosition + 1, objectPath.length);
}

function getVideoThumbnailPath(objectPath) {
    var lastSpecialPosition = objectPath.lastIndexOf("/");
    var videothumbPath = objectPath.substring(0, lastSpecialPosition) + '/Thumb_' + objectPath.substring(lastSpecialPosition + 1, objectPath.length);
    var lastDotPosition = videothumbPath.lastIndexOf(".");
    var pathAfterRemovingExtention = videothumbPath.replace(videothumbPath.substring(lastDotPosition + 1, videothumbPath.length), '');
    return pathAfterRemovingExtention + 'jpg';
}

function deleteObject(destination, destKey) {
    return new Promise((resolve, reject) => {
        console.log('Deleting object --' + destKey);
        s3.deleteObject({
            Bucket: destination,
            Key: destKey
        }, function (err, data) {
            if (err) {
                console.log("Error in deleting object--", err);
                reject(false);
            } else {
                console.log('Object deleted--' + destKey);
                resolve(true);
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