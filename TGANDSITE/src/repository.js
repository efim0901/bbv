  import { config } from './config.js';

  const useSupabase =
    config.databaseProvider === 'supabase' ||
    (config.databaseProvider === 'auto' && config.supabaseUrl && config.supabaseServiceRoleKey);

  const repository = useSupabase
    ? await import('./supabaseDb.js')
    : await import('./db.js');

  export const ValidationError = repository.ValidationError;
  export const addFavorite = repository.addFavorite;
  export const closeDatabase = repository.closeDatabase;
  export const createListing = repository.createListing;
  export const createUser = repository.createUser;
  export const deleteListing = repository.deleteListing;
  export const getCategories = repository.getCategories;
  export const getFavorites = repository.getFavorites;
  export const getListingById = repository.getListingById;
  export const getListings = repository.getListings;
  export const getStats = repository.getStats;
  export const getUserListings = repository.getUserListings;
  export const removeFavorite = repository.removeFavorite;
  export const updateListing = repository.updateListing;
  export const updateUser = repository.updateUser;