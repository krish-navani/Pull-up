const { withProjectBuildGradle } = require('@expo/config-plugins');

const FIX_MARKER = '// @pullup/reanimated-worklets-prefab-order-fix';
const FIX_BLOCK = `
${FIX_MARKER}
// Ensure CMake configuration waits for Reanimated/Worklets Prefab outputs.
// Reanimated consumes Worklets' prefab package, and the app consumes both.
gradle.projectsEvaluated {
  def reanimatedProject = rootProject.findProject(":react-native-reanimated")
  def workletsProject = rootProject.findProject(":react-native-worklets")
  def appProject = rootProject.findProject(":app")

  def reanimatedDebugPrefab = reanimatedProject?.tasks?.findByName("prefabDebugPackage")
  def reanimatedReleasePrefab = reanimatedProject?.tasks?.findByName("prefabReleasePackage")
  def workletsDebugPrefab = workletsProject?.tasks?.findByName("prefabDebugPackage")
  def workletsReleasePrefab = workletsProject?.tasks?.findByName("prefabReleasePackage")

  reanimatedProject?.tasks?.matching { task ->
    task.name.startsWith("configureCMakeDebug") || task.name == "generateJsonModelDebug"
  }?.configureEach { task ->
    if (workletsDebugPrefab != null) {
      task.dependsOn(workletsDebugPrefab)
    }
  }

  reanimatedProject?.tasks?.matching { task ->
    task.name.startsWith("configureCMakeRelease") || task.name == "generateJsonModelRelease"
  }?.configureEach { task ->
    if (workletsReleasePrefab != null) {
      task.dependsOn(workletsReleasePrefab)
    }
  }

  appProject?.tasks?.matching { task ->
    task.name.startsWith("configureCMakeDebug") || task.name == "generateJsonModelDebug"
  }?.configureEach { task ->
    if (reanimatedDebugPrefab != null) {
      task.dependsOn(reanimatedDebugPrefab)
    }
    if (workletsDebugPrefab != null) {
      task.dependsOn(workletsDebugPrefab)
    }
  }

  appProject?.tasks?.matching { task ->
    task.name.startsWith("configureCMakeRelease") || task.name == "generateJsonModelRelease"
  }?.configureEach { task ->
    if (reanimatedReleasePrefab != null) {
      task.dependsOn(reanimatedReleasePrefab)
    }
    if (workletsReleasePrefab != null) {
      task.dependsOn(workletsReleasePrefab)
    }
  }
}
`;

module.exports = function withReanimatedWorkletsBuildFix(config) {
  return withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (!contents.includes(FIX_MARKER)) {
      config.modResults.contents = `${contents.trimEnd()}\n${FIX_BLOCK}\n`;
    }
    return config;
  });
};
