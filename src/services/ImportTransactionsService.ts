import { getCustomRepository, getRepository, In } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';

import Transaction from '../models/Transaction';
import Category from '../models/Category';

import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);

    const contactsReadStream = fs.createReadStream(filePath);

    // parametros da leitura, pode ser colocado outros
    const parsers = csvParse({
      from_line: 2, // começa no 2 a linha
    });

    // pipe le as linhas que estamo passando as configurações que é o parsers
    const parseCSV = contactsReadStream.pipe(parsers);

    // eu posso salvar linha a linha mais isso abre uma coneção no banco para cada linha
    // a varialvel transaction ira guardar todas as linhas e dara um commit unico
    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

    // para cada linha, data é os dados da linha
    parseCSV.on('data', async line => {
      // para cada linha estou destruturando os campos
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );
      if (!title || !type || !value) return; // se uns dos 3 estiver em branco sai

      categories.push(category);

      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    // procura categorias ja cadastrado
    const existenCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    const existentCategoriesTitles = existenCategories.map(
      (category: Category) => category.title,
    );

    // console.log(existentCategoriesTitles);
    // console.log(existenCategories);
    // console.log(categories);
    // console.log(transactions);

    // return { categories, transactions };

    const addCategoryTitles = categories
      .filter(category => !existentCategoriesTitles.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index); // tira os duplicados

    // console.log(addCategoryTitles);

    const newCategories = categoriesRepository.create(
      addCategoryTitles.map(title => ({ title })),
    );

    await categoriesRepository.save(newCategories);

    const finalCategories = [...newCategories, ...existenCategories];

    const createdTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepository.save(createdTransactions);

    await fs.promises.unlink(filePath);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
