#!/bin/bash
CI_PROJECT_DIR=$1

cd "${CI_PROJECT_DIR}" || exit
echo "[Info] Creating/Updating Cloud Formation Stack : ${STACK_NAME}"

# "C:\Program Files\Amazon\AWSCLIV2\aws.exe" cloudformation "${OPERATION}-stack" --stack-name "${STACK_NAME}" --template-body file://devops/cloudformation/lambdas.yaml --region "${REGION_NAME}" --capabilities CAPABILITY_AUTO_EXPAND CAPABILITY_IAM CAPABILITY_NAMED_IAM

aws cloudformation deploy --template-file file://devops/cloudformation/lambdas.yaml --region $REGION_NAME --stack-name $STACK_NAME --capabilities CAPABILITY_IAM
