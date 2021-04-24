#!/bin/bash

WORKSPACE=$( pwd )

. "${WORKSPACE}/.env"

echo "Work space :--- ${WORKSPACE}"

if [ -z "$STAGE" ]
then
      echo "WARNING: \$STAGE is not defined. Setting it to dev"
      STAGE=dev
fi

FUNCTION_NAME=dev_AddTagToPatientObjects
echo ${STACK_NAME}
echo ${BUCKET}
echo $FUNCTION_NAME
# make a build directory to store artifacts
rm -rf build
mkdir build

# make the deployment bucket in case it doesn't exist
aws s3 mb s3://$BUCKET 

# generate next stage yaml file
# aws cloudformation package                   \
#     --template-file $WORKSPACE/$FUNCTION_NAME/template.yaml            \
#     --output-template-file build/output.yaml \
#     --s3-bucket $BUCKET                      

# the actual deployment step
# aws cloudformation deploy                     \
#     --template-file build/output.yaml         \
#     --stack-name $STACK_NAME                     \
#     --capabilities CAPABILITY_IAM             \
#     --parameter-overrides STAGE=$STAGE





sam package --template-file $WORKSPACE/$FUNCTION_NAME/template.yaml --s3-bucket $BUCKET --output-template-file build/output.yaml

sam deploy --template-file build/output.yaml --capabilities CAPABILITY_IAM --stack-name $STACK_NAME --region $REGION --parameter-overrides STAGE=$STAGE