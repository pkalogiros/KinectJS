/*********************************
* KINECT SNAPSHOT, 7/02/2012
*---------------------------------
* Takes a picture (RGB camera - base64 jpg)
* (bypasses http since it uses jsonp)
* -able to store it in localStorage
**********************************/
(function( kinect ) {
	var _readyStateChange = function() {
		var img = kinect.imageCommands.currentImageData;

		_callback && _callback( img );
		
		_headContainer.removeChild( _xmlhttp );

		_saveImage && localStorage.setItem( 'img_' + new Date().getTime(), img );

		_xmlhttp = img = _callback = _saveImage = null;

		return false;
	},
	_headContainer = document.getElementsByTagName( 'head' )[ 0 ],
	_xmlhttp = null,
	_saveImage	= null,
	_callback;

	/*********************************
	* snapshot( FUNCTION, FUNCTION ) chainable added on vI
	*---------------------------------
	* Returns base64 encoded image can save it to localStorage
	* with date / timestamp if required
	* - callback : Function - what to do with the image data (base64 jpg)
	* - errorcallback : Function - called on error
	**********************************/
	kinect.snapshot = function( callback, errorcallback ) {
		if( _xmlhttp || !kinect.address )
			errorcallback && errorcallback();
		else
		{
			_xmlhttp = document.createElement( 'script' );
			_xmlhttp.setAttribute( 'type', 'text/javascript' );
			_xmlhttp.setAttribute( 'defer', 'defer' );

			_callback = callback;
			_xmlhttp.onload = _readyStateChange;

			_xmlhttp.setAttribute( 'src', "http://" + kinect.address + "/?u=image#" + new Date().getTime() );
			_headContainer.appendChild( _xmlhttp );
		}

		return kinect.imageCommands;
	};

	kinect.imageCommands = {
		snapshot			:	kinect.snapshot,
		currentImageData	:	null,
		/*********************************
		* Saves image to localStorage if specified
		* example : kinect.snapshot(...).saveToLocalStorage();
		**********************************/
		saveToLocalStorage	: function() {
			_saveImage = true;

			return this;
		},
		/*********************************
		* removes item "name" from the localStorage - chainable
		**********************************/
		removeImage : function( name ) {
			localStorage.removeItem( name );

			return this;
		},
		/*********************************
		* purgeGallery( INT ) - returns imageArray added on vI
		* --------------------------------
		* Deletes images from the gallery (the oldest ones first) 
		* and keeps only as many as specified in its sole argument
		*
		* count (int) - how many pictures to keep
		* if left unspecified, defaults to 7
		**********************************/
		purgeGallery : function( count ) {
			var storage_len = localStorage.length,
				picture_holder = [],
				tmp,
				i,
				ret = [];
		
			if( count !== 0 )
				!count && ( count = 7 );
			
			for (i = 0; i < storage_len; ++i )	//grab the pictures from the localStorage
				if( localStorage.key( i ).indexOf('img_') !== -1 )
					picture_holder.push( localStorage.key( i ) );
			
			var slen = picture_holder.length;
			i = -1;
			if( slen > count )	//delete them if there are more than 7
			{
				tmp = slen - count;
				while( ++i < tmp )
				{
					localStorage.removeItem( picture_holder[ i ] );
					picture_holder[ i ] = null;
				}
			}
			
			for( i = 0, tmp = picture_holder.length; i < tmp; ++i )
				if( picture_holder[ i ] )
					ret.push( picture_holder[ i ] );
			
			storage_len = tmp = picture_holder = i = null;
			return ret;
		}
	};
})( kinect );