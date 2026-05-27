import ToolbarModeSelector from './Toolbar/ToolbarModeSelector';

function isModeSelectorRegistered(extensionManager) {
  const toolbarModules = extensionManager?.modules?.toolbarModule;

  if (!Array.isArray(toolbarModules)) {
    return false;
  }

  return toolbarModules.some(
    ({ module }) => Array.isArray(module) && module.some(def => def.name === 'ohif.modeSelector')
  );
}

export default function getToolbarModule({ commandsManager, servicesManager, extensionManager }) {
  if (isModeSelectorRegistered(extensionManager)) {
    return [];
  }

  return [
    {
      name: 'ohif.modeSelector',
      defaultComponent: props =>
        ToolbarModeSelector({ ...props, commandsManager, servicesManager }),
    },
  ];
}
