// Ready-made question sets teachers can add from "Starter sets".
(function (root) {
  const T = 'Terms, coefficients and constants';
  const W = 'Writing expressions from words';
  const S1 = 'Substitution (one pronumeral)';
  const S2 = 'Substitution (two pronumerals)';
  const L = 'Identifying like terms';
  const C = 'Collecting like terms';
  const E = 'Equivalent expressions';
  const P = 'Generalising patterns';
  const X = 'Writing and using expressions in context';
  const mc = (skill, q, correct, ...wrong) => ({ type: 'mc', skill, q, options: [correct, ...wrong], correct: 0 });
  const tx = (skill, q, ...answers) => ({ type: 'text', skill, q, answers });

  const ALGEBRA_7 = {
    id: 'preset-y7-algebra-pretest',
    title: 'Year 7 Algebra: pre-test skills',
    description: 'New questions on every skill in the Year 7 Algebra pre-test: terms, writing expressions, substitution, like terms, equivalence, patterns and worded problems.',
    questions: [
      // Terms, coefficients and constants
      mc(T, 'In the expression $7m + n + 4mn + 9$, the coefficient of $n$ is:', '1', '0', '4', '9'),
      tx(T, 'How many terms are in the expression $5p + 3q + pq + 2$?', '4'),
      tx(T, 'What is the constant term in $4x + 7y + 11$?', '11'),
      tx(T, 'In $3a + 6ab + b + 5$, what is the coefficient of $ab$?', '6'),
      mc(T, 'In the expression $6 + 3k$, the constant term is:', '6', '3', '$k$', '$3k$'),
      tx(T, 'In $2h + 9g + 8$, what is the coefficient of $g$?', '9'),

      // Writing expressions from words
      mc(W, 'Which expression means "$p$ is multiplied by 4, then 3 is added"?', '$4p + 3$', '$4(p + 3)$', '$p + 12$', '$3p + 4$'),
      mc(W, 'Which expression means "7 is added to $m$, and the result is doubled"?', '$2(m + 7)$', '$2m + 7$', '$m + 14$', '$7m + 2$'),
      tx(W, 'Write an expression for the product of 9 and $t$ (without using ×).', '9t'),
      tx(W, 'Write an expression for 6 less than $y$.', 'y-6'),
      mc(W, 'Which expression means "the sum of $a$ and $b$ is divided by 2"?', '$\\frac{a + b}{2}$', '$a + \\frac{b}{2}$', '$2(a + b)$', '$\\frac{a}{2} + b$'),
      tx(W, 'Write an expression for: $h$ is tripled, then 4 is subtracted.', '3h-4'),
      mc(W, 'Which expression means "8 more than $c$"?', '$c + 8$', '$c - 8$', '$8c$', '$8 - c$'),

      // Substitution (one pronumeral)
      tx(S1, 'If $m = 5$, evaluate $4m + 3$.', '23'),
      mc(S1, 'If $k = 6$, the value of $2k + 7$ is:', '19', '33', '15', '26'),
      tx(S1, 'If $n = 8$, evaluate $\\frac{40}{n} + n$.', '13'),
      tx(S1, 'If $p = 7$, evaluate $p^2 - 9$.', '40'),
      tx(S1, 'If $x = 4$, evaluate $5x - 6$.', '14'),
      mc(S1, 'If $a = 3$, the value of $a^2 + 4$ is:', '13', '10', '7', '49'),

      // Substitution (two pronumerals)
      mc(S2, 'If $x = 2$ and $y = 7$, the value of $3x^2 + y$ is:', '19', '43', '13', '25'),
      tx(S2, 'Substitute $a = 6$ and $b = 3$ to evaluate $2a + 5b$.', '27'),
      tx(S2, 'Substitute $a = 6$ and $b = 3$ to evaluate $ab - a$.', '12'),
      tx(S2, 'Substitute $a = 6$ and $b = 3$ to evaluate $3(a - b) + b^2$.', '18'),
      tx(S2, 'If $a = 4$, evaluate $\\sqrt{a^2 + 9}$.', '5'),
      mc(S2, 'If $m = 3$ and $n = 4$, the value of $mn + n$ is:', '16', '11', '38', '19'),

      // Identifying like terms
      mc(L, 'Which of the following is a pair of like terms?', '$5xy$ and $2yx$', '$3x$ and $3y$', '$4a$ and $4a^2$', '$6m$ and $6$'),
      mc(L, 'Which term is a like term to $7k$?', '$3k$', '$7m$', '$7k^2$', '$7km$'),
      mc(L, 'Which pair are NOT like terms?', '$2b$ and $2b^2$', '$4c$ and $c$', '$3gh$ and $hg$', '$9$ and $1$'),
      mc(L, 'Which of the following is a pair of like terms?', '$8pq$ and $qp$', '$8p$ and $8q$', '$8pq$ and $8p$', '$p^2$ and $2p$'),

      // Collecting like terms
      tx(C, 'Simplify $6y + 4y - 2y$.', '8y'),
      tx(C, 'Simplify $5k + 8 + 3k - 2$.', '8k+6'),
      mc(C, 'The expression $7a + 3b - 4a + 2b$ simplifies to:', '$3a + 5b$', '$11a + 5b$', '$3a + b$', '$8ab$'),
      tx(C, 'Simplify $4mn + 6m - mn + 3m$.', '3mn+9m'),
      tx(C, 'Simplify $5xy + 3y - 2yx + 4 + y$.', '3xy+4y+4'),
      mc(C, 'The expression $9p - 3p + 2$ simplifies to:', '$6p + 2$', '$8p$', '$12p + 2$', '$6p - 2$'),
      tx(C, 'Simplify $2a + 3b + 4a + b$.', '6a+4b'),

      // Equivalent expressions
      mc(E, 'Which expression is equivalent to $(y + 3) \\times 4$?', '$4y + 12$', '$4y + 3$', '$y + 12$', '$12y$'),
      mc(E, 'Which expression is equivalent to $6m$?', '$4m + 2m$', '$m + 6$', '$m^6$', '$4m + 2$'),
      mc(E, 'Which expression is equivalent to $3(x + 2)$?', '$3x + 6$', '$3x + 2$', '$x + 6$', '$5x$'),
      tx(E, 'What is the value of $2(x + 5)$ when $x = 2$?', '14'),
      mc(E, 'Which two expressions are equivalent?', '$2x + 8$ and $2(x + 4)$', '$2x + 4$ and $2(x + 4)$', '$x + 4$ and $4x$', '$8x$ and $2x + 8$'),
      mc(E, 'Liam says $4w + 5$ is equivalent to $9w$. Substitute $w = 2$. Is Liam right?', 'No: $4w + 5 = 13$ but $9w = 18$', 'Yes: $4 + 5 = 9$', 'Yes: both give 13', 'Yes: both expressions contain $w$'),

      // Generalising patterns
      mc(P, '$5 + 5 + 5 + 5 = 4 \\times 5$ and $8 + 8 + 8 + 8 = 4 \\times 8$. Which rule works for any number $n$?', '$n + n + n + n = 4n$', '$n + 4 = 4n$', '$n \\times n \\times n \\times n = 4n$', '$n + n + n + n = n + 4$'),
      tx(P, 'Write $n + n + n + n + n$ in its simplest form.', '5n'),
      mc(P, 'Write $n \\times n \\times n$ using a power.', '$n^3$', '$3n$', '$n + 3$', '$3^n$'),

      // Writing and using expressions in context
      tx(X, 'Apples cost $\\$a$ each. Write an expression for the cost of 6 apples.', '6a'),
      tx(X, 'Apples cost $\\$a$ each and juices cost $\\$4$ each. Write an expression for the total cost of 6 apples and 3 juices.', '6a+12'),
      tx(X, 'Apples cost $\\$2$ each and juices cost $\\$4$ each. What is the total cost, in dollars, of 6 apples and 3 juices?', '24'),
      tx(X, 'Apples cost $\\$a$ each and juices cost $\\$4$ each. Sam buys 2 apples and 1 juice, then later buys 3 more apples and 1 more juice. Write a simplified expression for the total amount Sam spends.', '5a+8'),
      tx(X, 'A rectangle has a length of $(x + 3)$ cm and a width of $x$ cm. Write a simplified expression for its perimeter.', '4x+6'),
      tx(X, 'A rectangle has a length of $(x + 3)$ cm and a width of $x$ cm. What is its perimeter, in cm, when $x = 5$?', '26'),
      tx(X, 'A rectangle has a length of $(x + 3)$ cm and a width of $x$ cm. What is its area, in cm², when $x = 5$?', '40'),
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
