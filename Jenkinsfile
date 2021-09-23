// pipeline {
//   agent any
//   stages {
//   stage('Stage 1') {
//       steps {
//         script {
//           echo 'Stage 1'
//         }
//       }
//     }
//   stage('Stage 2') {
//       steps {
//         script {
//           echo 'Stage 2'
//         }
//       }
//     }
//   }
// }

pipeline {
  agent any
  stages {
  stage('Stage 1') {
      steps {
        script {
            checkout([ $class: 'GitSCM', 
            branches: [[name: '*/25_05_2021']], 
            doGenerateSubmoduleConfigurations: false, 
            extensions: [[
                $class: 'MessageExclusion', excludedMessage: '.*skip-?ci.*'
            ]], 
            submoduleCfg: [], 
            userRemoteConfigs: [[
                credentialsId: '265ab289-8032-42d1-a86f-efd2114d49d9', url: 'git@github.com:swamy411/Devops-data1.git'
            ]]
            ])
        }
      }
    }
  }
}
