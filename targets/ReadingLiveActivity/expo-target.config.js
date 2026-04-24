/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'ReadingLiveActivity',
  displayName: 'Applivre',
  deploymentTarget: '16.2',
  icon: '../../assets/images/icon.png',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  colors: {
    $accent: '#c27b52',
  },
};
