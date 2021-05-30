var AWS = require('aws-sdk');
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var http = require('http');
var s3 = new AWS.S3();
var surgeonName;
var lensmediaBucket;
var ownerId;

exports.handler = (event, context, callback) => {
console.log('----event--',event);
    var envReq = getParameterFromSystemManager();
    envReq.then(() => {
    var gpid = event['gpid'];
    var tokenId = event['tokenid'];
     surgeonName = event['surgeonname'];
    var globalannotations = event['globalannotations'];
    var medias = event['medias'];
    var localannotations = event['localannotations'];
    lensmediaBucket = environment['envprefix'] + '-lensmediabucket';
    var sourceBucket = lensmediaBucket;
    var destBucket = environment['envprefix'] + '-lensarchiveobjects';
    var proceduredeleterecoverstatus = true;
    ownerId = event['ownerId'];

    // To updated procedure status to deletiong in Progress 
    // updateProcedureObjectsDeleteStatus(gpid,1);
    var bodyString = JSON.stringify({
        "gpid": gpid,
        "surgeonname": surgeonName,
        "medias": medias,
        "globalannotations": globalannotations,
        "localannotations": localannotations
    });


    globalannotations.forEach(function (globalAnnotationsItems, index) {// For copying the videos to videos foder from source folder
        console.log('globalAnnotationsItems---', globalAnnotationsItems)
        for (var key in globalAnnotationsItems) {
            if (key == 'filepath') {
                console.log(globalAnnotationsItems[key]);
                var source = sourceBucket + '/' + globalAnnotationsItems[key];
                var lastSpecialPosition = globalAnnotationsItems[key].lastIndexOf("/");
                var destination = destBucket + '/' + globalAnnotationsItems[key].substring(0, globalAnnotationsItems[key].lastIndexOf("/"));
                console.log(destination);
                var destKey = globalAnnotationsItems[key].substring(lastSpecialPosition + 1, globalAnnotationsItems[key].length);

                copyObject(source, destination, destKey, globalAnnotationsItems[key], tokenId, bodyString, proceduredeleterecoverstatus);
            }
        }

    });

    medias.forEach(function (mediaItems, index) {// For deleting the images/videos from the origin folder
        for (var key in mediaItems) {
            if (key == 'filepath') {
                console.log(mediaItems[key]);
                var source = sourceBucket + '/' + mediaItems[key];
                console.log('source--', source);
                var lastSpecialPosition = mediaItems[key].lastIndexOf("/");

                var destination = destBucket + '/' + mediaItems[key].substring(0, mediaItems[key].lastIndexOf("/"));
                console.log('destination--', destination);
                var destKey = mediaItems[key].substring(lastSpecialPosition + 1, mediaItems[key].length);
                console.log('destkey---', destKey);
                console.log('bodyString--', bodyString)
                copyObject(source, destination, destKey, mediaItems[key], tokenId, bodyString, proceduredeleterecoverstatus);

                var paramsImages = {
                    Bucket: lensmediaBucket,
                    Key: getImageThumbnailPath(mediaItems[key])
                };
                deleteObject(paramsImages);

                var paramsVideos = {
                    Bucket: lensmediaBucket,
                    Key: getVideoThumbnailPath(mediaItems[key])
                };
                deleteObject(paramsVideos);

            }
        }

    });

    localannotations.forEach(function (localannotationsItems, index) {// For deleting the images/videos from the origin folder
        for (var key in localannotationsItems) {
            if (key == 'filepath') {
                console.log(localannotationsItems[key]);
                var source = sourceBucket + '/' + localannotationsItems[key];
                var lastSpecialPosition = localannotationsItems[key].lastIndexOf("/");
                var destination = destBucket + '/' + localannotationsItems[key].substring(0, localannotationsItems[key].lastIndexOf("/"));
                console.log(destination);
                var destKey = localannotationsItems[key].substring(lastSpecialPosition + 1, localannotationsItems[key].length);
                copyObject(source, destination, destKey, localannotationsItems[key], tokenId, bodyString, proceduredeleterecoverstatus);
            }
        }

    });

    console.log('proceduredeleterecoverstatus-----', proceduredeleterecoverstatus);
    if (proceduredeleterecoverstatus == true) {
        updateProcedureObjectsDeleteStatus(gpid, 2);
    } else {
        updateProcedureObjectsDeleteStatus(gpid, 5);
        callback(null, 'fail');
    }
    callback(null, 'pass');

    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};


function copyObject(source, destination, destKey, innerpath, tokenId, bodyString, proceduredeleterecoverstatus) {
    s3.copyObject({
        CopySource: source,
        Bucket: destination,
        Key: destKey,
        StorageClass: 'GLACIER'
    }, function (copyErr, copyData) {
        if (copyErr) {
            console.log("Error in copying object--", copyErr);
            proceduredeleterecoverstatus = false;
        } else {
            console.log('Object copied--' + destKey);
            var params = {
                Bucket: lensmediaBucket,
                Key: innerpath
            };
            deleteObject(params);

            updateStatus(bodyString, tokenId, proceduredeleterecoverstatus, innerpath);

        }
    });

}

function deleteObject(params) {
    s3.deleteObject(params, function (err, data) {
        if (err) {
            console.log(err, err.stack); // an error occurred
            console.log('Erro in deleting Object--', params.Key);
        } else {
            console.log(data);           // successful response
            console.log('Deleted object--', params.Key);

        }

    });
}


function getImageThumbnailPath(objectPath) {
    var lastSpecialPosition = objectPath.lastIndexOf("/");
    return objectPath.substring(0, lastSpecialPosition) + '/Thumb_' + objectPath.substring(lastSpecialPosition + 1, objectPath.length)
}


function getVideoThumbnailPath(objectPath) {
    var lastSpecialPosition = objectPath.lastIndexOf("/");
    var videothumbPath = objectPath.substring(0, lastSpecialPosition) + '/Thumb_' + objectPath.substring(lastSpecialPosition + 1, objectPath.length)
    var lastDotPosition = videothumbPath.lastIndexOf(".");
    var pathAfterRemovingExtention = videothumbPath.replace(videothumbPath.substring(lastDotPosition + 1, videothumbPath.length), '');
    return pathAfterRemovingExtention + 'jpg';

}


function updateStatus(input, tokenId, proceduredeleterecoverstatus, innerpath) {

    console.log('tokenId--', tokenId)
    console.log('str---', input);
    const options = {
        host: environment['API_host'],
        port: environment['API_port'],
        path: '/patient/procedure',
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': tokenId,
             'surgeonid': surgeonName
        }
    };
    if (ownerId) {
        options.headers['ownerid'] = ownerId;
    }
    console.log('-updateStatus---options-', options);
    console.log(input);
    const req = http.request(options, (res) => {
        if (res.statusCode == 204) {
            console.log('Success in updating archival status of the object : ');
            let parsedJson = JSON.parse(input);
            auditLogDelete(innerpath, tokenId, parsedJson.gpid);
        } else {
            console.error('Error in updating archival status of the object: ');
            proceduredeleterecoverstatus = false;
        }

        res.on('data', (d) => {
            process.stdout.write(d)
        })
    })

    req.on('error', (error) => {
        console.error(error)
    })
    req.useChunkedEncodingByDefault = true;
    req.write(input)
    req.end()

    // http.request(options, deleteCallback).write(input);
}

function auditLogDelete(inputPath, tokenId, gpid) {
    let fileName = inputPath.split('/');
    let fileNameStr = fileName[fileName.length - 1] + ' for ' + gpid;
    console.log('### filename string ', fileNameStr);
    callAuditLogForDelete(fileNameStr, tokenId);
}

function callAuditLogForDelete(inputStr, tokenId) {
    const options = {
        host: environment['API_host'],
        port: environment['API_port'],
        path: '/webapp/deleteFileSecure',
        method: 'HEAD',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': tokenId,
            'filename': inputStr
        }
    };
    console.log(options);
    let req =http.request(options,(response) => {
        let statusCode = response.statusCode;
        response.on('end', ()=> {
            
                if(statusCode == 202) {
                    console.log("Audit logged ", inputStr);
                } else {
                
                    console.log("Error in Audit log ", inputStr);
                }
        });
    });
    req.write("Audit Logged Success");
    req.end();
}



function updateProcedureObjectsDeleteStatus(gpid, status) {


    console.log('Update Status called--', gpid);
    console.log('Update Status called--', status);


    var path = '/patient/procedure/delete/recover';

    var bodyString = JSON.stringify({
        'gpid': gpid,
        'status': status,

    });

    console.log('gpid--', gpid);
    console.log('status--', status);

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