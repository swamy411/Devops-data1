#!/bin/bash
CI_PROJECT_DIR=$1

cd "${CI_PROJECT_DIR}" || exit
echo "[Info] Creating/Updating Cloud Formation Stack : ${STACK_NAME}"

# "C:\Program Files\Amazon\AWSCLIV2\aws.exe" cloudformation "${OPERATION}-stack" --stack-name "${STACK_NAME}" --template-body file://devops/cloudformation/lambdas.yaml --region "${REGION_NAME}" --capabilities CAPABILITY_AUTO_EXPAND CAPABILITY_IAM CAPABILITY_NAMED_IAM

"C:\Program Files\Amazon\AWSCLIV2\aws.exe" cloudformation "${OPERATION}-stack" --stack-name "${STACK_NAME}" --template-url "https://${TEMPLATE_S3_BUCKET}.s3.amazonaws.com/${STAGE}_lambdas.yaml" --region "${REGION_NAME}" --capabilities CAPABILITY_AUTO_EXPAND CAPABILITY_IAM CAPABILITY_NAMED_IAM



#"C:\Program Files\Amazon\AWSCLIV2\aws.exe" cloudformation "update-stack" --stack-name "Jenkins-Dev2-Stack" --template-url https://jenkins-sam-template.s3.amazonaws.com/dev2_sam_template_v2.yaml --region "us-east-1" --capabilities CAPABILITY_AUTO_EXPAND CAPABILITY_IAM CAPABILITY_NAMED_IAM


#'templateBody' failed to satisfy constraint: Member must have length less than or equal to 51200