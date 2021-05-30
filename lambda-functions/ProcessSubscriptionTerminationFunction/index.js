var aws = require('aws-sdk');
var lambda = new aws.Lambda({
    region: 'us-east-1'
});
var ssm = new aws.SSM();
var envPath = process.env.ssm_store;
var environment = {};

exports.handler = (event) => {
    
    var surgeonname = event['surgeon'];
    var archivedIds = event['archivedgpIds'];

    console.log('archivedIds----',archivedIds);
    console.log("Restoring data for surgeon - ",surgeonname);
    
    var envReq = getParameterFromSystemManager();
    envReq.then(() => {
       var payloadJson = JSON.stringify({
                'gpid': archivedIds,
                'tokenid': 'Random ID',
                'surgeonname' : surgeonname
               
            });
        lambda.invoke({
            FunctionName: environment['envprefix']+'_RestoreProcedureFunction',
            Payload: payloadJson
        }, function(err, data) {
            console.log('Function call');
            if (err) {
                console.log('eror : ' + err);
            } else if (data) {
                console.log('Data resored for gpid--',payloadJson);
            
            }
        });
    })
    .catch((err) => {
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