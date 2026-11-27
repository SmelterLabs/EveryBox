const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch packages/shared and workspace node_modules without overriding Metro serverRoot
config.watchFolders = [
  path.resolve(monorepoRoot, 'packages/shared'),
  path.resolve(monorepoRoot, 'node_modules')
]

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules')
]

const mobileReactDir = path.resolve(projectRoot, 'node_modules/react')

// Enforce the mobile workspace's React 19.0.0 across all hoisted monorepo packages
// (the root desktop workspace uses a newer React 19 minor that mismatches RN 0.79's renderer)
config.resolver.extraNodeModules = {
  react: mobileReactDir,
  'react-native': path.resolve(monorepoRoot, 'node_modules/react-native')
}

const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    const mobileOrigin = path.resolve(projectRoot, 'index.js')
    const redirectedContext = {
      ...context,
      originModulePath: mobileOrigin
    }
    if (defaultResolveRequest) {
      return defaultResolveRequest(redirectedContext, moduleName, platform)
    }
    return context.resolveRequest(redirectedContext, moduleName, platform)
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

config.server = {
  ...config.server,
  unstable_serverRoot: projectRoot
}

module.exports = config
