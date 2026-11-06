/** The build of MapLibre that keeps its worker in a file of its own, which the content security policy of the window allows. */
declare module "maplibre-gl/dist/maplibre-gl-csp" {
  import maplibregl from "maplibre-gl";
  export * from "maplibre-gl";
  export default maplibregl;
}
