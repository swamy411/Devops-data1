exports.handler = (event, context, callback) =>{
  console.log(event, context, callback);
  console.log(event.triggerSource);
  
  if (event.request.userAttributes.hasOwnProperty('custom:group_name')) {
      // if(event.request.userAttributes['custom:group_name'] == 'admin' ) {
      if(event.request.userAttributes['custom:group_name']!= 'surgeon' && event.request.userAttributes['custom:group_name'] != 'hospital_admin') {
          callback(Error('errorregistration'));
      }
  }

  callback(null, event);
  
};
