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
// node( 'some_node' ) {
//   stage( "Phase 1" ) {
//     sshagent( credentials: [ 'git@github.com:swamy411/Devops-data1.git' ] ) {
//       checkout scm
//       def lastSuccessfulCommit = getLastSuccessfulCommit()
//       def currentCommit = commitHashForBuild( currentBuild.rawBuild )
//       if (lastSuccessfulCommit) {
//         commits = sh(
//           script: "git rev-list $currentCommit \"^$lastSuccessfulCommit\"",
//           returnStdout: true
//         ).split('\n')
//         println "Commits are: $commits"
//       }
//     }
//   }
// }
node {
      stage("checkout") {
        git url: 'git@github.com:swamy411/Devops-data1.git'
      }

      stage("last-changes") {
        def publisher = LastChanges.getLastChangesPublisher "LAST_SUCCESSFUL_BUILD", "SIDE", "LINE", true, true, "", "", "", "", ""
              publisher.publishLastChanges()
              def changes = publisher.getLastChanges()
              println(changes.getEscapedDiff())
              for (commit in changes.getCommits()) {
                  println(commit)
                  def commitInfo = commit.getCommitInfo()
                  println(commitInfo)
                  println(commitInfo.getCommitMessage())
                  println(commit.getChanges())
              }
      }

}
// def getLastSuccessfulCommit() {
//   def lastSuccessfulHash = null
//   def lastSuccessfulBuild = currentBuild.rawBuild.getPreviousSuccessfulBuild()
//   if ( lastSuccessfulBuild ) {
//     lastSuccessfulHash = commitHashForBuild( lastSuccessfulBuild )
//   }
//   return lastSuccessfulHash
// }

// /**
//  * Gets the commit hash from a Jenkins build object, if any
//  */
// @NonCPS
// def commitHashForBuild( build ) {
//   def scmAction = build?.actions.find { action -> action instanceof jenkins.scm.api.SCMRevisionAction }
//   return scmAction?.revision?.hash
// }
