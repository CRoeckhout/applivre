// Stub web pour `react-native/Libraries/Renderer/shims/ReactFabric`.
// Ce module est le renderer Fabric de RN — n'existe pas sur web. Importé
// par react-native-reanimated (pulled via pnpm hoisting depuis le node_
// modules de l'app parent). On exporte un objet vide ; reanimated tombe
// sur ses fallbacks internes pour le rendu non-Fabric.
export default {};
