import axios from 'axios';
import dayjs from 'dayjs';
import dotenv from 'dotenv';
import { program } from 'commander';
import fs from 'fs';
import ObjToCSV from 'objects-to-csv';

dotenv.config();

const apiKey = process.env.API_KEY;
const tagsUrl = 'https://content.guardianapis.com/tags';

async function getContent(apiUrl, startDate, page) {
  const { status, data } = await axios.get(apiUrl, {
    params: {
      'api-key': apiKey,
      'show-fields': 'all',
      'page-size': 100,
      'from-date': startDate,
      page,
    },
  });

  if (status !== 200 || !data || data.response.status === 'error') {
    throw new Error('Cannot Get Guardianapi!');
  }

  return data.response;
}

async function getContents(apiUrl, startDate, path) {
  const results = [];
  try {
    let page = 0;
    let totalPage = 0;
    const data = await getContent(apiUrl, startDate, ++page);
    results.push(...(data.results || []));
    totalPage = data.pages;
    const promises = [];
    while (page < totalPage) {
      promises.push(getContent(apiUrl, startDate, ++page));
    }

    const list = await Promise.all(promises);
    for (const item of list) {
      results.push(...(item.results || []));
    }
    const dataList = results.map((item) => ({
      id: item.id,
      publicationDate: item.webPublicationDate,
      title: item.fields.headline,
      author: item.fields.byline,
      content: item.fields.bodyText,
      url: item.fields.shortUrl,
      section: item.sectionId,
    }));
    const csv = new ObjToCSV(dataList);
    await csv.toDisk(path, {
      append: true,
    });
    console.log(`--- finish ${apiUrl} ---`);
    return dataList.length;
  } catch (error) {
    console.log(error.message);
  }
  return [];
}

async function getSection(sectionName, page) {
  const { status, data } = await axios.get(tagsUrl, {
    params: {
      type: 'keyword',
      section: sectionName,
      'api-key': apiKey,
      page,
    },
  });

  if (status !== 200 || !data || data.response.status === 'error') {
    throw new Error('Cannot Get Guardianapi!');
  }
  return data.response;
}

async function getSections(sectionName) {
  try {
    const result = [];
    let page = 0;
    let totalPage = 0;
    const data = await getSection(sectionName, ++page);
    totalPage = data.pages;
    result.push(...data.results);
    const promises = [];
    while (page < totalPage) {
      promises.push(getSection(sectionName, ++page));
    }
    const resultList = await Promise.all(promises);
    for (const item of resultList) {
      result.push(...item.results);
    }
    return result.map((item) => item.apiUrl);
  } catch (error) {
    console.log(error.message);
  }

  return;
}

(async function () {
  program.version('0.0.1');

  program
    .option('-s, --section <section>', 'guardian section', 'business')
    .option('-t, --time <time>', 'start date', '2021-01-01')
    .option('-p, --path <path>', 'file path', './file.csv')
    .parse(process.argv);

  const options = program.opts();
  if (options.section && options.time && options.path) {
    const path = options.path;
    if (fs.existsSync(path)) {
      fs.rmSync(path);
    }
    let date = dayjs(options.time);
    if (!date.isValid) {
      console.log('Date Not Valid');
      return;
    }
    console.log('--- start crawling ---');
    const sectionList = await getSections(options.section);
    if (!sectionList) {
      return;
    }
    const promises = [];
    console.log('-- start to get content ---');
    date = date.format('YYYY-MM-DD');
    for (const url of sectionList) {
      promises.push(getContents(url, date, path));
    }
    try {
      const lengthList = await Promise.all(promises);
      let count = 0;
      for (const item of lengthList) {
        if (!item) continue;
        count += item;
      }
      console.log(`--- finish ${count} data ---`);
    } catch (error) {
      console.log(error.message);
    }
  } else {
    console.log('No tagName or startDate specified');
  }
})();
