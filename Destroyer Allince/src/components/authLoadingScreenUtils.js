export const DEFAULT_AUTH_LOADING_SCREEN_SRC = "/assets/LOADINGSCREEN/LOAD1.png";

export const primeAuthLoadingScreen = (imageSrc = DEFAULT_AUTH_LOADING_SCREEN_SRC) => {
  if (typeof window === "undefined") {
    return;
  }

  const image = new window.Image();
  image.decoding = "async";
  image.src = imageSrc;
};
