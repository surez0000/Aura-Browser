import type { FavoriteEntry } from '@shared/models'
import type { KvStore } from './db/kv'

const KEY = 'favorites'
const MAX_FAVORITES = 12

export class FavoritesService {
  constructor(
    private readonly kv: KvStore,
    private readonly notify: (favorites: FavoriteEntry[]) => void,
  ) {}

  list(): FavoriteEntry[] {
    return this.kv.get<FavoriteEntry[]>(KEY) ?? []
  }

  add(entry: FavoriteEntry): FavoriteEntry[] {
    if (!entry.url.startsWith('https://') && !entry.url.startsWith('http://')) {
      return this.list()
    }
    const rest = this.list().filter((f) => f.url !== entry.url)
    const next = [entry, ...rest].slice(0, MAX_FAVORITES)
    this.save(next)
    return next
  }

  remove(url: string): FavoriteEntry[] {
    const next = this.list().filter((f) => f.url !== url)
    this.save(next)
    return next
  }

  private save(favorites: FavoriteEntry[]): void {
    this.kv.set(KEY, favorites)
    this.notify(favorites)
  }
}
