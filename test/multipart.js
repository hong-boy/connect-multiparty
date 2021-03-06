
process.env.NODE_ENV = 'test';

var Buffer = require('safe-buffer').Buffer
var connect = require('connect');
var multipart = require('..');
var request = require('supertest');
var should = require('should');

describe('multipart()', function(){
  it('should ignore GET', function(done){
    request(createServer())
    .get('/body')
    .field('user', 'Tobi')
    .expect(200, {}, done)
  })

  describe('with multipart/form-data', function(){
    it('should populate req.body', function(done){
      request(createServer())
      .post('/body')
      .field('user', 'Tobi')
      .expect(200, { user: 'Tobi' }, done)
    })

    it('should handle duplicated middleware', function (done) {
      var app = connect()
      .use(multipart())
      .use(multipart())
      .use(function (req, res) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(req.body))
      })

      request(app)
      .post('/body')
      .field('user', 'Tobi')
      .expect(200, { user: 'Tobi' }, done)
    })

    it('should support files', function(done){
      var app = createServer()

      app.use(function(req, res){
        should(req.body.user).eql({ name: 'Tobi' });
        req.files.text.path.should.endWith('.txt');
        req.files.text.constructor.name.should.equal('Object');
        res.end(req.files.text.originalFilename);
      });

      request(app)
      .post('/')
      .field('user[name]', 'Tobi')
      .attach('text', Buffer.from('some text here'), 'foo.txt')
      .expect(200, 'foo.txt', done);
    })
    
    it('should keep extensions', function(done){
      var app = createServer()

      app.use(function(req, res){
        should(req.body.user).eql({ name: 'Tobi' });
        req.files.text.path.should.endWith('.txt');
        req.files.text.constructor.name.should.equal('Object');
        res.end(req.files.text.originalFilename);
      });

      request(app)
      .post('/')
      .field('user[name]', 'Tobi')
      .attach('text', Buffer.from('some text here'), 'foo.txt')
      .expect(200, 'foo.txt', done);
    })
    
    it('should work with multiple fields', function(done){
      request(createServer())
      .post('/body')
      .field('user', 'Tobi')
      .field('age', '1')
      .expect(200, { user: 'Tobi', age: '1' }, done)
    })
    
    it('should handle duplicated fields', function (done) {
      request(createServer())
      .post('/body')
      .field('user', 'Tobi')
      .field('user', 'Loki')
      .field('user', 'Poki')
      .expect(200, { user: [ 'Tobi', 'Loki', 'Poki' ] }, done)
    })

    it('should support nesting', function(done){
      request(createServer())
      .post('/body')
      .field('user[name][first]', 'tobi')
      .field('user[name][last]', 'holowaychuk')
      .field('user[age]', '1')
      .field('species', 'ferret')
      .expect(200, {
        species: 'ferret',
        user: {
          age: '1',
          name: { first: 'tobi', last: 'holowaychuk' }
        }
      }, done)
    })

    it('should support multiple files of the same name', function(done){
      var app = createServer()

      app.use(function(req, res){
        req.files.text.should.have.length(2);
        req.files.text[0].constructor.name.should.equal('Object');
        req.files.text[1].constructor.name.should.equal('Object');
        res.end();
      });

      request(app)
      .post('/')
      .attach('text', Buffer.from('some text here'), 'foo.txt')
      .attach('text', Buffer.from('some more text stuff'), 'bar.txt')
      .expect(200, done);
    })
    
    it('should support nested files', function(done){
      var app = createServer()

      app.use(function(req, res){
        Object.keys(req.files.docs).should.have.length(2);
        req.files.docs.foo.originalFilename.should.equal('foo.txt');
        req.files.docs.bar.originalFilename.should.equal('bar.txt');
        res.end();
      });

      request(app)
      .post('/')
      .attach('docs[foo]', Buffer.from('some text here'), 'foo.txt')
      .attach('docs[bar]', Buffer.from('some more text stuff'), 'bar.txt')
      .expect(200, done);
    })
    
    it('should next(err) on multipart failure', function(done){
      var app = createServer()

      app.use(function(err, req, res, next){
        err.message.should.equal('Expected alphabetic character, received 61');
        res.statusCode = err.status;
        res.end('bad request');
      });

      var test = request(app).post('/');
      test.set('Content-Type', 'multipart/form-data; boundary=foo');
      test.write('--foo\r\n');
      test.write('Content-filename="foo.txt"\r\n');
      test.write('\r\n');
      test.write('some text here');
      test.write('Content-Disposition: form-data; name="text"; filename="bar.txt"\r\n');
      test.write('\r\n');
      test.write('some more text stuff');
      test.write('\r\n--foo--');
      test.expect(400, 'bad request', done);
    })

    it('should not hang request on failure', function(done){
      var app = createServer()
      var buf = Buffer.alloc(1024 * 10, '.')

      app.use(function(err, req, res, next){
        err.message.should.equal('Expected alphabetic character, received 61');
        res.statusCode = err.status;
        res.end('bad request');
      });

      var test = request(app).post('/');
      test.set('Content-Type', 'multipart/form-data; boundary=foo');
      test.write('--foo\r\n');
      test.write('Content-filename="foo.txt"\r\n');
      test.write('\r\n');
      test.write('some text here');
      test.write('Content-Disposition: form-data; name="text"; filename="bar.txt"\r\n');
      test.write('\r\n');
      test.write('some more text stuff');
      test.write('\r\n--foo--');
      test.write(buf);
      test.write(buf);
      test.write(buf);
      test.expect(400, 'bad request', done);
    })

    it('should default req.files to {}', function(done){
      request(createServer())
      .post('/body')
      .expect(200, {}, done)
    })

    it('should return 400 on maxFilesSize exceeded', function(done){
      var max = Math.pow(2, 9)

      request(createServer({ maxFilesSize: max }))
      .post('/files')
      .field('user[name]', 'Tobi')
      .attach('text', Buffer.alloc(max + 1, 'x'), 'foo.txt')
      .expect(400, done);
    })
  })
})

function createServer (opts) {
  var app = connect()

  app.use(multipart(opts))

  app.use('/body', function (req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(req.body))
  })

  app.use('/files', function (req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(req.files))
  })

  return app
}
