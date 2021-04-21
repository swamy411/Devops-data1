var http = require('http');

exports.handler = async (event, context, callback) => {
    console.log(event.request.userAttributes);
    // TODO implement
    if (event.request.userAttributes['custom:license_code']){
        console.log('In callAPI, params: ' + event.userName);
        
        return await new Promise((resolve, reject) => {
            var headers = {
                'Content-Type': 'application/json',
                'lambda': '#1234lambd@_tr1gger4321#'
            };
            
            var options = {
                protocol: 'http:',
                host: '10.182.0.113',
                port: 8080,
                path: '/user/registration',
                method: 'POST',
                headers: headers
            };
            
            
            var body = JSON.stringify({
                    "subscriptionCode": event.request.userAttributes['custom:license_code'],
                    "userName": event.userName,
                    "firstName": event.request.userAttributes['given_name'],
                    "lastName": event.request.userAttributes['family_name'],
                    "email": event.request.userAttributes['email'],
                    "phoneNo": event.request.userAttributes['phone_number'],
                    "userRole": event.request.userAttributes['custom:group_name']
            });
            console.log("## Body Json");
            console.log(body);
            
            console.log(options);
            
            const req =  http.request(options, (res) => {
              console.log(res.statusCode);
              console.log(res);
              console.log('SuccessCall Message: ' + res);
              if(res.statusCode == 201) {
                  console.log('Successfull Registration');
              } else {
                  console.log('Error Registration' + res.statusCode + res);
              }
              resolve('SuccessCall');
            });
            
            req.on('error', (e) => {
              console.log('Error Message: ' + e.message);
              reject(e.message);
            });
            
            console.log('End Data call');
            req.write(body);
            req.end();
        });
    }
    
};