import { Client, Account, Databases, Storage, Query} from 'appwrite'

const client = new Client()

client
  .setEndpoint('https://sgp.cloud.appwrite.io/v1')
  .setProject('civic-issues')

export const account = new Account(client)
export const databases = new Databases(client)
export const storage = new Storage(client)
export { Query }

export const DATABASE_ID = 'civic-db'
export const COLLECTIONS = {
  reports: 'reports',
  staff_accounts: 'staff_accounts',
}
export const BUCKET_ID = 'complaint-photos'