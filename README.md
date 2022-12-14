# tech-companies
Add and maintain a Notion database of tech companies Notion API.

Source: [Swedish Tech News: 900+ Swedish tech startups & scaleups – the ultimate list (2022)](https://www.swedishtechnews.com/ultimate-swedish-startups-list/) 

## Features
* Use the power of Notion databases
  * Add custom columns and add page data to the added companies. 
  * Create filters and sort the data based on your needs.
  * Add the column types `Created time` and `Last edited time` to see when data was added/changed.
* Adding tags based on the company description using stemming.
  * The tags can be modified in `data/tags.json`

## Customization
* The tags can be modified in `data/tags.json`
* The column names can be modified in the file `src/models/configs.model.ts`
## How to run locally 
- Follow step 1 and 2 in the [Notion developer documentation](https://developers.notion.com/docs/getting-started) to get the Notion API key and Database ID
- Create a .env file
  - Add NOTION_API_KEY
  - Add NOTION_DATABASE_ID
- Npm install
- Npm run build 
- Npm run start

## Todos
- [x] config file for column names
- [x] changelog in column or page data