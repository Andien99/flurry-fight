// Ready-made question sets teachers can add from "Starter sets".
(function (root) {
  const T = 'Terms, coefficients and constants';
  const L = 'Identifying like terms';
  const C = 'Collecting like terms';
  const S = 'Substitution';
  const E = 'Equivalent expressions';
  const mc = (skill, q, correct, ...wrong) => ({ type: 'mc', skill, q, options: [correct, ...wrong], correct: 0 });
  const tx = (skill, q, ...answers) => ({ type: 'text', skill, q, answers });

  const ALGEBRA_7 = {
    id: 'preset-y7-algebra-pretest',
    version: 4, // bump when the questions change so saved copies are refreshed
    title: 'Year 7 Algebra: core skills',
    description: 'Like terms, collecting like terms, constants, coefficients and number of terms, substitution and equivalent expressions. Includes a modified list with simpler questions for students who need it.',
    questions: [
      // Identifying like terms
      mc(L, 'Which of the following is a pair of like terms?', '$5xy$ and $2yx$', '$3x$ and $3y$', '$4a$ and $4a^{2}$', '$6m$ and $6$'),
      mc(L, 'Which term is a like term to $7k$?', '$3k$', '$7m$', '$7k^{2}$', '$7km$'),
      mc(L, 'Which pair are NOT like terms?', '$2b$ and $2b^{2}$', '$4c$ and $c$', '$3gh$ and $hg$', '$9$ and $1$'),
      mc(L, 'Which of the following is a pair of like terms?', '$8pq$ and $qp$', '$8p$ and $8q$', '$8pq$ and $8p$', '$p^{2}$ and $2p$'),
      mc(L, 'Which term is a like term to $4a^{2}$?', '$-a^{2}$', '$4a$', '$4b^{2}$', '$4$'),
      mc(L, 'Which term is a like term to $3mn$?', '$-5nm$', '$3m$', '$3n$', '$3m^{2}$'),
      mc(L, 'In $6x + 2y - 3x + 5$, which term is a like term to $6x$?', '$-3x$', '$2y$', '$5$', '$6$'),
      mc(L, 'Which list contains only like terms?', '$2t$, $-t$, $9t$', '$2t$, $2s$, $2$', '$t$, $t^{2}$, $2t$', '$3t$, $3ts$, $3s$'),

      // Collecting like terms
      tx(C, 'Simplify $3x + 5x$.', '8x'),
      tx(C, 'Simplify $9m - 4m$.', '5m'),
      tx(C, 'Simplify $6y + 4y - 2y$.', '8y'),
      tx(C, 'Simplify $5k + 8 + 3k - 2$.', '8k+6'),
      mc(C, 'The expression $7a + 3b - 4a + 2b$ simplifies to:', '$3a + 5b$', '$11a + 5b$', '$3a + b$', '$8ab$'),
      mc(C, 'The expression $4x + 3y + 2x - y$ simplifies to:', '$6x + 2y$', '$6x + 4y$', '$8xy$', '$2x + 2y$'),
      tx(C, 'Simplify $7ab - 3ba$.', '4ab'),
      tx(C, 'Simplify $4mn + 6m - mn + 3m$.', '3mn+9m'),
      tx(C, 'Simplify $5xy + 3y - 2yx + 4 + y$.', '3xy+4y+4'),
      mc(C, 'The expression $9p - 3p + 2$ simplifies to:', '$6p + 2$', '$8p$', '$12p + 2$', '$6p - 2$'),
      tx(C, 'Simplify $2a + 3b + 4a + b$.', '6a+4b'),

      // Terms, coefficients and constants
      mc(T, 'In the expression $7m + n + 4mn + 9$, the coefficient of $n$ is:', '1', '0', '4', '9'),
      mc(T, 'In $x + 4y$, the coefficient of $x$ is:', '1', '0', '4', '$x$'),
      tx(T, 'In $3a + 6ab + b + 5$, what is the coefficient of $ab$?', '6'),
      tx(T, 'In $2h + 9g + 8$, what is the coefficient of $g$?', '9'),
      mc(T, 'In $5a - 8b + 2$, the coefficient of $b$ is:', '$-8$', '$8$', '$2$', '$5$'),
      tx(T, 'What is the constant term in $4x + 7y + 11$?', '11'),
      mc(T, 'In the expression $6 + 3k$, the constant term is:', '6', '3', '$k$', '$3k$'),
      tx(T, 'What is the constant term in $9 + 2m - n$?', '9'),
      tx(T, 'How many terms are in the expression $5p + 3q + pq + 2$?', '4'),
      tx(T, 'How many terms are in $3x - 2y + 7$?', '3'),

      // Substitution
      tx(S, 'If $m = 5$, evaluate $4m + 3$.', '23'),
      mc(S, 'If $k = 6$, the value of $2k + 7$ is:', '19', '33', '15', '26'),
      tx(S, 'If $x = 4$, evaluate $5x - 6$.', '14'),
      tx(S, 'If $n = 8$, evaluate $\\frac{40}{n} + n$.', '13'),
      tx(S, 'If $p = 7$, evaluate $p^{2} - 9$.', '40'),
      mc(S, 'If $a = 3$, the value of $a^{2} + 4$ is:', '13', '10', '7', '49'),
      mc(S, 'If $x = 3$ and $y = 5$, the value of $x^{2} + y$ is:', '14', '11', '8', '64'),
      tx(S, 'If $a = 6$ and $b = 3$, evaluate $2a + 5b$.', '27'),
      tx(S, 'If $a = 6$ and $b = 3$, evaluate $ab - a$.', '12'),
      mc(S, 'If $m = 3$ and $n = 4$, the value of $mn + n$ is:', '16', '11', '38', '19'),

      // Equivalent expressions
      mc(E, 'Which expression is equivalent to $6m$?', '$4m + 2m$', '$m + 6$', '$m^{6}$', '$4m + 2$'),
      mc(E, 'Which expression is equivalent to $5a + 2a$?', '$7a$', '$7a^{2}$', '$10a$', '$5a + 2$'),
      mc(E, 'Which expression is equivalent to $x \\times y \\times 3$?', '$3xy$', '$x + y + 3$', '$3x + y$', '$xy^{3}$'),
      mc(E, 'Which expression is NOT equivalent to $4n$?', '$n + 4$', '$2n + 2n$', '$n \\times 4$', '$5n - n$'),
    ],
    // Modified list: the same skills with smaller numbers, fewer terms, three options and a reminder in the question.
    modified: [
      // Identifying like terms
      mc(L, 'Like terms have the same letters. Which term is a like term to $5x$?', '$2x$', '$5y$', '$5$'),
      mc(L, 'Like terms have the same letters. Which term is a like term to $3a$?', '$a$', '$3b$', '$3$'),
      mc(L, 'Which is a pair of like terms?', '$4m$ and $7m$', '$4m$ and $4n$', '$4m$ and $4$'),
      mc(L, 'Which is a pair of like terms?', '$2y$ and $9y$', '$2y$ and $2$', '$y$ and $x$'),
      mc(L, 'Numbers on their own are like terms. Which term is a like term to $6$?', '$1$', '$6x$', '$x$'),
      mc(L, 'Which term is a like term to $ab$?', '$3ab$', '$3a$', '$3b$'),

      // Collecting like terms
      mc(C, 'Simplify $2x + 3x$.', '$5x$', '$6x$', '$5$'),
      tx(C, 'Simplify $a + a + a$.', '3a'),
      tx(C, 'Simplify $4m + 2m$.', '6m'),
      mc(C, 'Simplify $7y - 2y$.', '$5y$', '$9y$', '$5$'),
      tx(C, 'Simplify $5k - k$.', '4k'),
      mc(C, 'Simplify $3x + 2 + x$.', '$4x + 2$', '$6x$', '$3x + 3$'),
      mc(C, 'Simplify $2a + 3b + a$.', '$3a + 3b$', '$6ab$', '$2a + 4b$'),

      // Terms, coefficients and constants
      mc(T, 'The coefficient is the number in front of the letter. In $4x$, the coefficient is:', '4', '$x$', '$4x$'),
      mc(T, 'In $7 + 2y$, the coefficient of $y$ is:', '2', '7', '$y$'),
      mc(T, 'A constant is a number on its own. In $3m + 5$, the constant is:', '5', '3', '$m$'),
      mc(T, 'In $x + 9$, the constant term is:', '9', '1', '$x$'),
      mc(T, 'Terms are separated by + and − signs. How many terms are in $2a + 3b$?', '2', '5', '1'),
      mc(T, 'How many terms are in $x + y + 4$?', '3', '2', '4'),

      // Substitution
      mc(S, 'If $x = 3$, what is $x + 4$?', '7', '34', '12'),
      mc(S, 'If $a = 5$, what is $2a$? (Remember $2a$ means $2 \\times a$.)', '10', '25', '7'),
      tx(S, 'If $m = 2$, evaluate $m + 8$.', '10'),
      mc(S, 'If $y = 4$, what is $3y$?', '12', '34', '7'),
      tx(S, 'If $k = 6$, evaluate $k - 1$.', '5'),
      mc(S, 'If $n = 2$, what is $2n + 1$?', '5', '23', '7'),

      // Equivalent expressions
      mc(E, 'Which is the same as $3 \\times x$?', '$3x$', '$x + 3$', '$x^{3}$'),
      mc(E, 'Which is equivalent to $a + a$?', '$2a$', '$a^{2}$', '$a + 2$'),
      mc(E, 'Which is equivalent to $4y$?', '$2y + 2y$', '$4 + y$', '$y^{4}$'),
      mc(E, 'Which is equivalent to $x + x + x$?', '$3x$', '$x^{3}$', '$x + 3$'),
    ],
  };

  const SAMPLE = {
    id: 'sample', title: 'Sample: number warm-up',
    description: 'A quick mixed number warm-up to try the game.',
    questions: [
      { type: 'mc', q: 'What is 7 × 8?', options: ['56', '54', '48', '64'], correct: 0 },
      { type: 'mc', q: 'Simplify $\\frac{6}{8}$', options: ['$\\frac{3}{4}$', '$\\frac{2}{3}$', '$\\frac{4}{3}$', '$\\frac{1}{2}$'], correct: 0 },
      { type: 'text', q: 'Solve $3x + 5 = 20$. Type the value of $x$.', answers: ['5'] },
      { type: 'mc', q: 'What is $-4 - 7$?', options: ['$-11$', '$-3$', '$3$', '$11$'], correct: 0 },
      { type: 'text', q: 'What is 25% of 80?', answers: ['20'] },
      { type: 'mc', q: 'Which number is prime?', options: ['29', '27', '33', '39'], correct: 0 },
      { type: 'mc', q: 'Evaluate $2^5$', options: ['32', '10', '25', '16'], correct: 0 },
      { type: 'text', q: 'Write $\\frac{3}{5}$ as a decimal.', answers: ['0.6'] },
      { type: 'mc', q: 'The angles in a triangle add to…', options: ['180°', '360°', '90°', '270°'], correct: 0 },
      { type: 'text', q: 'What is $\\sqrt{81}$?', answers: ['9'] },
    ],
  };

  const api = [ALGEBRA_7, SAMPLE];
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FFPresets = api;
})(typeof window !== 'undefined' ? window : globalThis);
