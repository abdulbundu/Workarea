require 'test_helper'

module Workarea
  class DirectUploadTest < TestCase
    def test_asserting_type
      assert_raises { DirectUpload.new(:foo, filename) }
    end

    def test_getting_upload_url
      filename = '001.2.red.jpg'
      result = DirectUpload.new(:product_image, filename).upload_url

      assert_includes(result, filename)
      assert_match(URI::regexp, result)
    end

    def test_getting_the_file
      upload_file
      direct_upload = DirectUpload.new(:product_image, 'foo.0.jpg')

      File.open(product_image_file_path, 'rb') do |file|
        assert_equal(product_image_file, direct_upload.file)
      end
    end

    def test_deleting
      upload_file
      DirectUpload.new(:product_image, 'foo.0.jpg').delete!
      assert_nil(DirectUpload.new(:product_image, 'foo.0.jpg').file)
    end

    def test_validation
      direct_upload = DirectUpload.new(:product_image, 'foo.0.jpg')
      refute(direct_upload.valid?)

      create_product(id: 'foo')
      assert(direct_upload.valid?)

      direct_upload = DirectUpload.new(:product_image, 'foo.0.bar.jpg')
      assert(direct_upload.valid?)

      direct_upload = DirectUpload.new(:product_image, 'foo.jpg')
      refute(direct_upload.valid?)

      direct_upload = DirectUpload.new(:product_image, 'bar.0.jpg')
      refute(direct_upload.valid?)
    end

    private

    def upload_file
      Workarea.s3.directories.new(key: Configuration::S3.bucket).files.create(
        key: DirectUpload.new(:product_image, 'foo.0.jpg').key,
        body: product_image_file
      )
    end
  end
end
