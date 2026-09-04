const { withAppBuildGradle } = require('@expo/config-plugins');

const marker = 'def readProjectEnvValue = { String name ->';

module.exports = function withGoogleMapsGradleEnv(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('withGoogleMapsGradleEnv requires a Groovy app/build.gradle');
    }

    let source = modConfig.modResults.contents;
    if (source.includes(marker)) return modConfig;

    const projectRootLine = 'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()';
    const helper = `${projectRootLine}
def readProjectEnvValue = { String name ->
    def envFile = new File(projectRoot, ".env")
    if (!envFile.exists()) return null

    def entry = envFile.readLines("UTF-8").find { line ->
        def trimmed = line.trim()
        !trimmed.startsWith("#") && trimmed.startsWith("\\${name}=")
    }
    if (!entry) return null

    def value = entry.substring(entry.indexOf('=') + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length() - 1)
    }
    return value ?: null
}

def googleMapsApiKey = System.getenv("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY") ?:
    findProperty("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY") ?:
    readProjectEnvValue("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY")

if (!googleMapsApiKey) {
    throw new GradleException("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is required for Android builds.")
}`;

    if (!source.includes(projectRootLine)) {
      throw new Error('Unable to locate projectRoot in app/build.gradle');
    }

    source = source.replace(projectRootLine, helper);
    modConfig.modResults.contents = source;
    return modConfig;
  });
};