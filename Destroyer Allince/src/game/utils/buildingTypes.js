export const BUILDING_TYPES = {
  TOWN_HALL: {
    id: "town-hall",
    name: "Town Hall",
    label: "TH",
    cost: 320,
    color: 0xd97706,
    bodyHeight: 68,
    roofHeight: 20,
    footprintRows: 2,
    footprintCols: 2,
  },
  WOOD_MACHINE: {
    id: "wood-machine",
    name: "Wood Machine",
    label: "WM",
    cost: 240,
    color: 0xb45309,
    shopImage: "/assets/machine-wood.png",
    bodyHeight: 46,
    roofHeight: 14,
    footprintRows: 1,
    footprintCols: 1,
  },
  COMMAND_CENTER: {
    id: "command-center",
    name: "Command Center",
    label: "CC",
    cost: 1800,
    color: 0x334155,
    shopImage: "/assets/command center.png",
    bodyHeight: 84,
    roofHeight: 22,
    footprintRows: 1,
    footprintCols: 1,
  },
  SKYPORT: {
    id: "skyport",
    name: "Chopper Bay",
    label: "SP",
    cost: 2000,
    color: 0x64748b,
    shopImage: "/assets/chopper/skychop.png",
    bodyHeight: 64,
    roofHeight: 18,
    footprintRows: 2,
    footprintCols: 2,
  },
};

export const BUILDING_LIST = Object.values(BUILDING_TYPES);

export const getBuildingUpgradeCost = (buildingTypeOrId) => {
  const buildingType = typeof buildingTypeOrId === "string"
    ? BUILDING_LIST.find((item) => item.id === buildingTypeOrId)
    : buildingTypeOrId;

  return Math.max(0, Number(buildingType?.cost ?? 0) * 3);
};
