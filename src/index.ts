import parse, { NodeType } from "node-html-parser";
import 'dotenv/config'
import * as natural from 'natural';
import fetch from "cross-fetch";
import { APIErrorCode, APIResponseError, Client } from "@notionhq/client";
import { PageObjectResponse, QueryDatabaseResponse, UpdatePageParameters } from "@notionhq/client/build/src/api-endpoints";
import { Presets, SingleBar } from "cli-progress";
import { readFile } from 'fs/promises';
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const CHANGELOG : Array<string> = []
const databaseId = process.env.NOTION_DATABASE_ID as string;
interface Company {
  cities: Set<string>;
  description: string;
  name: string;
  link: string | null;
  raw: string;
  tags: Set<string>
}
interface CompanyPage extends Company{
  pageId:string
}
async function getTags(){
    const stemMap = new Map<string,Set<string>>()
    const fileContents = await readFile('data/tags.json','utf-8');
    const tagMap = JSON.parse(fileContents) as Record<string,string>
    Object.entries(tagMap).forEach(([tag,tokens]) =>  
        {
            const stemmed = natural.PorterStemmer.tokenizeAndStem(tokens)
            stemmed.forEach(word=>{
                if(stemMap.has(word)){
                    stemMap.get(word)?.add(tag)
                }
                else{
                    stemMap.set(word,new Set([tag]))
                }
            })
        }
    );
    return stemMap
}
async function scrapeCompanies() {
  const tagMap = await getTags();
  const url = "https://www.swedishtechnews.com/ultimate-swedish-startups-list/";
  const text = await (await fetch(url)).text();
  const root = parse(text);
  const companies: Array<Company> = root
    .querySelectorAll(
      "body > div.site > div > div > main > article > div.post-content.gh-content.kg-canvas > p:nth-child(1) > a "
    )
    .filter(
      (n) => n.tagName === "A" && n.nextSibling.nodeType === NodeType.TEXT_NODE
    )
    .map((n) => {
      const raw = n.nextSibling.textContent;
      let text = raw.replace(/[()]/g, "");
     
      let city = text?.split(",")[0];
      if (city) {
       const trimmed = text?.split(",").slice(1).join(',').trim();
       if(trimmed){
        text = trimmed[0].toUpperCase() + trimmed.slice(1)
       }
      } else{
        const cleaned = raw.split("(").slice(1).join("(");
        const commaSeparated = cleaned.split(",");
        city = commaSeparated[0];
        text = commaSeparated.slice(1).join(",").replace(/[()]/g, "");
      }

      if (
        city
          ?.split(" ")
          .some((w) => w.length && w[0] !== w[0].toUpperCase() && w !== "and")
      ) {
        if (!text) {
          text = city;
        }
        city = "";
      }
      const cities = city.split(/and|&/).map((c) => c.trim());
      const tokens = natural.PorterStemmer.tokenizeAndStem(text)
      const tags = new Array<string>()
      const empty = new Set<string>();
      tokens.forEach(token=> {
        const tokenTags = tagMap.get(token) || empty 
        tags.push(...tokenTags)
      })
      return {
        link: n.getAttribute("href") || null,
        name: n.textContent,
        description:text,
        cities: new Set<string>(cities.map(c=> c?.trim()).filter(c=> !!c)),
        raw,
        tags: new Set<string>(tags.map(t=> t?.trim()).filter(t=>!!t))
      };
    })
    .slice(3);
    return companies;
}
function mapBy<K, V>(items: V[], getKey: (item: V) => K): Map<K, V> {
	const m = new Map();
	items?.forEach((item) => {
		const key = getKey(item);
		if (m.has(key)) {
      console.log("Duplicate key",key)
		}else{
      m.set(key, item);
    }
	});
	return m;
}
async function addCompaniesToNotion({companies, existing}: {companies: Array<Company>, existing: Array<CompanyPage>}){
  const bar1 = new SingleBar({},Presets.shades_classic);
  const createdPages = new Array<string>()
  const updatedPages = new Array<string>()
  const unchangedPages = new Array<string>()
  const existingMap = mapBy(existing,e=> e.name)
  bar1.start(companies.length,0)
    for( const company of companies){
      const companyPage = existingMap.get(company.name)
      if(companyPage){
        const updatedPageId = await updateCompanyPage(company,companyPage)
        if(updatedPageId){
          updatedPages.push(updatedPageId)
        }else{
          unchangedPages.push(companyPage.pageId)
        }
      }
      else{
        const pageId = await addCompanyToPage(company)
        if(pageId){
          createdPages.push(pageId)
        }
      }
      bar1.increment()
    }
    return {created: createdPages,updated:updatedPages,unchanged: unchangedPages}
}
function areSetsEqual(aItems: Set<string>,bItems:Set<string>):boolean{
return aItems.size === bItems.size &&
    [...aItems].every((item) => bItems.has(item));
}
async function updateCompanyPage(company: Company, companyPage: CompanyPage) {
  let  changedProps  = false;
  const args: Required<Pick<UpdatePageParameters,'page_id' | 'properties'>> = {page_id: companyPage.pageId, properties: {}}
  const diffs : Array<{property: string, old:string, updated:string}> = []
  if(!areSetsEqual(company.cities,companyPage.cities)){
    args.properties.Cities = {multi_select: Array.from(company.cities).map(c=> ({name:c}))}
    diffs.push({property:'Cities',old:`${Array.from(companyPage.cities).sort()}`,updated: `${Array.from(company.cities).sort()}` })
     changedProps=true
  }
  if(!areSetsEqual(company.tags,companyPage.tags)){
    args.properties.Tags = {multi_select: Array.from(company.tags).map(t=> ({name: t}))}
    diffs.push({property:'Tags',old:`${Array.from(companyPage.tags).sort()}`,updated: `${Array.from(company.tags).sort()}` })
    changedProps=true
 }
  if(company.raw  !== companyPage.raw){
    args.properties.Raw = {rich_text: [{text: {content: company.raw}}]}
    diffs.push({property:'Raw',old:`${companyPage.raw}`,updated: `${company.raw}` })
    changedProps=true
  }
  if(company.description  !== companyPage.description){
    args.properties.Description= {rich_text: [{text: {content: company.description}}]}
    diffs.push({property:'Description',old:`${companyPage.description}`,updated: `${company.description}` })
    changedProps=true
  }
  if(company.link  !== companyPage.link){
    args.properties.Link = {url: company.link}
    diffs.push({property:'Link',old:`${companyPage.link}`,updated: `${company.link}` })
    changedProps=true
  }
  if(diffs.length){
    const diffStrings = diffs.map(d=> `
    Property: ${d.property}
    Old: ${d.old}
    Updated: ${d.updated}
    `)
    const diffStr = `
    Diffs ${company.name} 
    ${diffStrings.join("\n")}
    `;
   
    args.properties.Changelog= {rich_text: diffStrings.map(str=> ({text: {content: str}}))}
    CHANGELOG.push(diffStr)
  }
  if(changedProps){
    const p = await notion.pages.update(args)
    return p.id
  }  
}
async function addCompanyToPage(company: Company) {
    try {
        const resp = await notion.pages.create({
            parent: { database_id: databaseId },
            properties: { 
                "Name": { title: [{ text: { content: company.name } }] },
                "Description": {rich_text: [{text: {content: company.description}}]},
                "Link": {url: company.link} ,
                "Cities": {multi_select: Array.from(company.cities).map(c=> ({name:c}))},
                "Raw": {rich_text: [{text: {content: company.raw}}]},
                "Tags": {multi_select: Array.from(company.tags).map(t=> ({name: t}))},
                "Changelog":{rich_text: []}
            },
          });
          return resp.id
    }catch(e){
        const notionError = e as APIResponseError;
        if(notionError.code === APIErrorCode.ConflictError){
            console.warn("Conflict with name", company.name)
        }
        else{
            console.warn({message:notionError.message,errorCode:notionError.code, statusCode: notionError.status})
        }
        return ""
    }
  
  
}
export function unique<K, V>(items: V[], getKey: (item: V) => K): V[] {
	const s: Set<K> = new Set();
	const filtered: Array<V> = [];
	items?.forEach((item) => {
		const key = getKey(item);
		if (!s.has(key)) {
			s.add(key);
			filtered.push(item);
		}
	});
	return filtered;
}
async function getExistingPages():Promise<Array<CompanyPage>>{
  let startCursor: string | null  = null;
  const allCompanies: Array<CompanyPage> = []
  console.log("Read existing database") 
  do{
    const queryResponse: QueryDatabaseResponse = await notion.databases.query({database_id: databaseId,page_size:100,start_cursor: startCursor || undefined, sorts:[{property:'Name',direction:'ascending'}]})
    startCursor = queryResponse.next_cursor;
    const companies = queryResponse.results.map(r=>  pageToCompany(r as PageObjectResponse))
    allCompanies.push(...companies)
    console.log(`fetched ${allCompanies.length} rows`)
  }while(startCursor)
  // Check for duplicates
  mapBy(allCompanies,c=>c.link || '')
  const mappedByName = mapBy(allCompanies,c=>c.name || '')
  console.log(`found ${mappedByName.size} companies `)
  return allCompanies
}
function pageToCompany(page: PageObjectResponse): CompanyPage{
  const name = getTitleFromPage(page)
  const tags = getMultiSelectNamesFromPage(page,'Tags')
  const cities = getMultiSelectNamesFromPage(page,'Cities')
  const link = getURLFromPage(page,'Link')
  const description = getTextFromPage(page,'Description')
  const raw = getTextFromPage(page,'Raw')
  const pageId = page.id
  return {name,tags,cities,link,description,raw,pageId}
}
function getTextFromPage(page: PageObjectResponse,column: string): string{
  const prop = page.properties[column]
  if(!prop){
    throw new Error(`${column} prop is not found ${page.properties}`);
  }
  if(prop.type !== 'rich_text'){
    throw new Error(`${column} prop is not a rich_text ${page.properties}`);
  }
  return prop.rich_text[0]?.plain_text
}
function getURLFromPage(page:PageObjectResponse,column:string): string | null{
  const prop = page.properties[column]
  if(!prop){
    throw new Error(`${column} prop is not found ${page.properties}`);
  }
  if(prop.type !== 'url'){
    throw new Error(`${column} prop is not a url ${page.properties}`);
  }
  return prop.url
}
function getMultiSelectNamesFromPage(page: PageObjectResponse,column: string): Set<string>{
  const prop = page.properties[column]
  if(!prop){
    throw new Error(`${column} prop is not found ${page.properties}`);
  }
  if(prop?.type !== 'multi_select'){
      throw new Error(`${column} prop is not a multiselect ${page.properties}`);
  }
  const selections = prop?.multi_select.map(s=> s.name)
  return new Set<string>(selections)
    
}
function getTitleFromPage(page: PageObjectResponse): string{
  const nameProp = page.properties.Name
    if(nameProp?.type !== 'title'){
      throw new Error(`Name prop is not a title ${page.properties}`);
    }
    const titleProp = nameProp.title[0]
    if(!titleProp){
      console.count("Empty title")
      return '';
    }
    if(titleProp?.type !== 'text'){
      console.error(titleProp)
      throw new Error(`Title prop is not text`);
    }
    return titleProp.plain_text
    
}
async function main(){
  const companies = await scrapeCompanies();
  const existing = await getExistingPages();
  const pageIds =await addCompaniesToNotion({companies, existing})
  console.log("\n Done \n")
  console.log({created: pageIds.created.length,scraped: companies.length,updated: pageIds.updated.length, unchanged:pageIds.unchanged.length})
  if(CHANGELOG.length){
    console.log(CHANGELOG)
  }
 

}
main()


